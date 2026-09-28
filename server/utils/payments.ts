import Stripe from 'stripe'
import type { H3Event } from 'h3'
import {
  isPaymentOpen,
  settlementAction,
  paymentOpensAt,
  PAYMENT_WINDOW_MS,
  type CancelledBy,
} from '#shared/domain/pricing'
import { formatDay } from '#shared/utils/time'
import type { Tables } from '~~/app/types/database.types'
import type { UserClient } from './auth'

/**
 * Paiement : Stripe Checkout en capture différée (empreinte bancaire).
 * - l'empreinte est posée quand le client paie (au plus tôt 7 jours avant le créneau) ;
 * - elle est capturée à la soumission du compte rendu, ou par la tâche
 *   planifiée avant son expiration ;
 * - annulation : empreinte libérée, capture partielle (pénalité) ou
 *   remboursement, selon l'état du paiement.
 * Toutes les opérations sont idempotentes et rejouables par la tâche
 * planifiée de rapprochement.
 */

type Payment = Tables<'payments'>
type Request = Tables<'visit_requests'>

let client: Stripe | null = null

export function stripe(): Stripe {
  if (client) return client
  const config = useRuntimeConfig()
  if (!config.stripeSecretKey) throw new Error('NUXT_STRIPE_SECRET_KEY manquante')
  client = new Stripe(config.stripeSecretKey, {
    maxNetworkRetries: 2,
    appInfo: { name: 'CheckMyFlat' },
    // stripe-mock en test
    ...(config.stripeApiHost
      ? {
          host: config.stripeApiHost,
          port: config.stripeApiPort || undefined,
          protocol: (config.stripeApiProtocol || 'https') as 'http' | 'https',
        }
      : {}),
  })
  return client
}

/** Marge de sécurité avant l'expiration d'une empreinte. */
const CAPTURE_MARGIN_MS = 24 * 3600_000

/* --------------------------------------------------------------- checkout -- */

export async function createCheckout(event: H3Event, request: Request, customerEmail: string) {
  if (request.status !== 'acceptee' || !request.agreed_price_cents || !request.slot_at) {
    throw createError({ statusCode: 409, statusMessage: 'Cette demande n’est pas à régler' })
  }
  const slot = new Date(request.slot_at)
  if (!isPaymentOpen(slot, new Date())) {
    throw createError({
      statusCode: 409,
      statusMessage:
        slot <= new Date()
          ? 'Le rendez-vous est passé'
          : `Le paiement ouvrira le ${formatDay(paymentOpensAt(slot))}`,
    })
  }
  const db = serviceClient(event)
  const { data: existing } = await db
    .from('payments')
    .select('id')
    .eq('request_id', request.id)
    .in('status', ['authorized', 'captured'])
  if (existing?.length) {
    throw createError({ statusCode: 409, statusMessage: 'Cette visite est déjà réglée' })
  }

  const site = useRuntimeConfig().public.siteUrl
  const amount = request.agreed_price_cents + request.urgent_fee_cents
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: request.agreed_price_cents,
        product_data: {
          name: `Visite déléguée ${request.reference}`,
          description: `${request.address}, ${request.city}`,
        },
      },
    },
  ]
  if (request.urgent_fee_cents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: request.urgent_fee_cents,
        product_data: { name: 'Supplément visite sous 48 h' },
      },
    })
  }

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    locale: 'fr',
    customer_email: customerEmail,
    line_items: lineItems,
    payment_intent_data: {
      capture_method: 'manual',
      metadata: { request_id: request.id, reference: request.reference },
      description: `CheckMyFlat ${request.reference}`,
    },
    metadata: { request_id: request.id },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${site}/demandes/${request.id}/paiement?retour=succes`,
    cancel_url: `${site}/demandes/${request.id}/paiement?retour=annule`,
  })

  const { error } = await db.from('payments').insert({
    request_id: request.id,
    stripe_checkout_session_id: session.id,
    amount_cents: amount,
    status: 'pending',
  })
  if (error) dbError(error)
  if (!session.url) throw createError({ statusCode: 502, statusMessage: 'Stripe indisponible' })
  return session.url
}

/* --------------------------------------------------------------- webhooks -- */

/**
 * Traite un événement Stripe vérifié. Idempotent : un événement déjà traité
 * est ignoré, et chaque mise à jour est conditionnée à l'état courant.
 */
export async function handleStripeEvent(event: H3Event, stripeEvent: Stripe.Event): Promise<void> {
  const db = serviceClient(event)
  const { error: seenError } = await db
    .from('stripe_events')
    .insert({ id: stripeEvent.id, type: stripeEvent.type })
  if (seenError?.code === '23505') {
    const { data: seen } = await db
      .from('stripe_events')
      .select('processed_at')
      .eq('id', stripeEvent.id)
      .single()
    if (seen?.processed_at) return
  } else if (seenError) {
    dbError(seenError)
  }

  switch (stripeEvent.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = stripeEvent.data.object
      const pi =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
      if (pi) {
        await db
          .from('payments')
          .update({ stripe_payment_intent_id: pi })
          .eq('stripe_checkout_session_id', session.id)
      }
      break
    }
    case 'checkout.session.expired': {
      await db
        .from('payments')
        .update({ status: 'canceled' })
        .eq('stripe_checkout_session_id', stripeEvent.data.object.id)
        .eq('status', 'pending')
      break
    }
    case 'payment_intent.amount_capturable_updated':
      await onAuthorized(event, db, stripeEvent.data.object)
      break
    case 'payment_intent.succeeded': {
      const pi = stripeEvent.data.object
      const payment = await paymentForIntent(db, pi)
      if (payment && payment.status !== 'refunded' && payment.status !== 'partially_refunded') {
        await db
          .from('payments')
          .update({ status: 'captured', captured_cents: pi.amount_received })
          .eq('id', payment.id)
      }
      break
    }
    case 'payment_intent.canceled': {
      const payment = await paymentForIntent(db, stripeEvent.data.object)
      if (payment) await db.from('payments').update({ status: 'canceled' }).eq('id', payment.id)
      break
    }
    case 'charge.refunded': {
      const charge = stripeEvent.data.object
      const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
      if (pi) {
        await db
          .from('payments')
          .update({
            refunded_cents: charge.amount_refunded,
            status: charge.amount_refunded >= charge.amount_captured ? 'refunded' : 'partially_refunded',
          })
          .eq('stripe_payment_intent_id', pi)
      }
      break
    }
    default:
      break
  }

  await db.from('stripe_events').update({ processed_at: new Date().toISOString() }).eq('id', stripeEvent.id)
}

async function paymentForIntent(db: UserClient, pi: Stripe.PaymentIntent): Promise<Payment | null> {
  const { data } = await db.from('payments').select('*').eq('stripe_payment_intent_id', pi.id).maybeSingle()
  if (data) return data
  // Les événements Stripe peuvent arriver dans le désordre : rattachement
  // par la demande si la session n'a pas encore été liée.
  const requestId = pi.metadata?.request_id
  if (!requestId) return null
  const { data: pending } = await db
    .from('payments')
    .select('*')
    .eq('request_id', requestId)
    .is('stripe_payment_intent_id', null)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!pending) return null
  await db.from('payments').update({ stripe_payment_intent_id: pi.id }).eq('id', pending.id)
  return { ...pending, stripe_payment_intent_id: pi.id }
}

async function onAuthorized(event: H3Event, db: UserClient, pi: Stripe.PaymentIntent) {
  if (pi.status !== 'requires_capture') return
  const payment = await paymentForIntent(db, pi)
  if (!payment) {
    console.error('[stripe] empreinte sans paiement connu', pi.id)
    return
  }
  const captureBefore = await captureDeadline(pi)
  await db
    .from('payments')
    .update({ status: 'authorized', capture_before: captureBefore.toISOString(), amount_cents: pi.amount })
    .eq('id', payment.id)
    .in('status', ['pending', 'authorized'])

  const { data: request } = await db.from('visit_requests').select('*').eq('id', payment.request_id).single()
  if (!request) return
  if (request.status === 'acceptee') {
    const { error } = await db.rpc('transition_request', {
      p_request_id: request.id,
      p_to: 'payee',
      p_reason: 'Paiement confirmé',
    })
    if (error) {
      console.error('[stripe] transition payee', error)
      return
    }
    await notify(event, { type: 'payment_confirmed', requestId: request.id })
  } else if (request.status === 'annulee') {
    // Paiement arrivé après une annulation : on libère l'empreinte.
    await settleCancellation(event, request.id)
  }
}

/** Date limite de capture donnée par Stripe, sinon 6 jours (marge sur les 7 jours usuels). */
async function captureDeadline(pi: Stripe.PaymentIntent): Promise<Date> {
  try {
    const full = await stripe().paymentIntents.retrieve(pi.id, { expand: ['latest_charge'] })
    const charge = full.latest_charge
    const ts =
      charge && typeof charge !== 'string' ? charge.payment_method_details?.card?.capture_before : undefined
    if (ts) return new Date(ts * 1000)
  } catch (error) {
    console.warn('[stripe] capture_before indisponible', (error as Error).message)
  }
  return new Date(Date.now() + PAYMENT_WINDOW_MS - CAPTURE_MARGIN_MS)
}

/* ---------------------------------------------------------------- capture -- */

/** Capture intégrale de l'empreinte d'une demande (visite réalisée ou expiration proche). */
export async function captureRequestPayment(db: UserClient, requestId: string): Promise<void> {
  const { data: payments } = await db
    .from('payments')
    .select('*')
    .eq('request_id', requestId)
    .eq('status', 'authorized')
  for (const payment of payments ?? []) {
    if (!payment.stripe_payment_intent_id) continue
    try {
      const pi = await stripe().paymentIntents.capture(
        payment.stripe_payment_intent_id,
        {},
        { idempotencyKey: `capture-${payment.id}` },
      )
      await db
        .from('payments')
        .update({ status: 'captured', captured_cents: pi.amount_received })
        .eq('id', payment.id)
    } catch (error) {
      // Rejoué par la tâche planifiée.
      console.error('[stripe] capture', payment.id, (error as Error).message)
    }
  }
}

/* ------------------------------------------------------------ annulation -- */

/**
 * Règle les paiements d'une demande annulée : libération de l'empreinte,
 * capture de la seule pénalité, ou remboursement. Le client n'est pénalisé
 * que s'il annule lui-même à moins de 24 h du créneau.
 */
export async function settleCancellation(event: H3Event | null, requestId: string): Promise<void> {
  const db = event ? serviceClient(event) : systemClient()
  const { data: request } = await db
    .from('visit_requests')
    .select('id, status, slot_at, zone_id, pricing_zones(late_penalty_pct)')
    .eq('id', requestId)
    .single()
  if (!request || request.status !== 'annulee') return

  const { data: cancel } = await db
    .from('visit_request_events')
    .select('actor_kind, created_at')
    .eq('request_id', requestId)
    .eq('to_status', 'annulee')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  const cancelledBy = (cancel?.actor_kind ?? 'admin') as CancelledBy
  const cancelledAt = new Date(cancel?.created_at ?? Date.now())
  const penaltyPct = request.pricing_zones?.late_penalty_pct ?? 0

  const { data: payments } = await db
    .from('payments')
    .select('*')
    .eq('request_id', requestId)
    .in('status', ['authorized', 'captured'])

  for (const payment of payments ?? []) {
    if (!payment.stripe_payment_intent_id) continue
    const { action, outcome } = settlementAction(
      {
        status: payment.status,
        amountCents: payment.amount_cents,
        capturedCents: payment.captured_cents,
        refundedCents: payment.refunded_cents,
      },
      {
        cancelledBy,
        slotAt: new Date(request.slot_at ?? cancelledAt),
        now: cancelledAt,
        latePenaltyPct: penaltyPct,
      },
    )
    if (action.kind === 'none') continue
    try {
      if (action.kind === 'capture') {
        const pi = await stripe().paymentIntents.capture(
          payment.stripe_payment_intent_id,
          { amount_to_capture: action.amountCents },
          { idempotencyKey: `penalty-${payment.id}` },
        )
        await db
          .from('payments')
          .update({ status: 'captured', captured_cents: pi.amount_received })
          .eq('id', payment.id)
      } else if (action.kind === 'release') {
        await stripe().paymentIntents.cancel(
          payment.stripe_payment_intent_id,
          { cancellation_reason: 'requested_by_customer' },
          { idempotencyKey: `release-${payment.id}` },
        )
        await db.from('payments').update({ status: 'canceled' }).eq('id', payment.id)
      } else {
        await stripe().refunds.create(
          { payment_intent: payment.stripe_payment_intent_id, amount: action.amountCents },
          { idempotencyKey: `refund-${payment.id}` },
        )
        await db
          .from('payments')
          .update({
            refunded_cents: action.amountCents,
            status: action.amountCents >= payment.captured_cents ? 'refunded' : 'partially_refunded',
          })
          .eq('id', payment.id)
      }
      await notify(event, {
        type: 'refund_issued',
        requestId,
        amountCents: outcome.refundCents,
        penaltyCents: outcome.penaltyCents,
      })
    } catch (error) {
      console.error('[stripe] annulation', payment.id, (error as Error).message)
    }
  }
}

/** Remboursement manuel par un admin (litige). */
export async function refundPayment(event: H3Event, requestId: string, amountCents: number): Promise<number> {
  const db = serviceClient(event)
  const { data: payment } = await db
    .from('payments')
    .select('*')
    .eq('request_id', requestId)
    .in('status', ['captured', 'partially_refunded'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!payment?.stripe_payment_intent_id) {
    throw createError({ statusCode: 409, statusMessage: 'Aucun paiement débité à rembourser' })
  }
  const refundable = payment.captured_cents - payment.refunded_cents
  if (amountCents > refundable) {
    throw createError({ statusCode: 422, statusMessage: 'Montant supérieur au solde remboursable' })
  }
  await stripe().refunds.create(
    { payment_intent: payment.stripe_payment_intent_id, amount: amountCents },
    { idempotencyKey: `refund-${payment.id}-${payment.refunded_cents}-${amountCents}` },
  )
  const refunded = payment.refunded_cents + amountCents
  await db
    .from('payments')
    .update({
      refunded_cents: refunded,
      status: refunded >= payment.captured_cents ? 'refunded' : 'partially_refunded',
    })
    .eq('id', payment.id)
  await notify(event, { type: 'refund_issued', requestId, amountCents, penaltyCents: 0 })
  return refunded
}

/* ---------------------------------------------------- tâche planifiée -- */

/**
 * Rapprochement périodique (toutes les 15 min) :
 * 1. expire les propositions de prix échues ;
 * 2. prévient les clients dont le paiement vient d'ouvrir ;
 * 3. annule les demandes non payées à l'heure du rendez-vous ;
 * 4. capture les empreintes qui vont expirer ;
 * 5. règle les annulations dont le paiement n'a pas encore été traité.
 */
export async function runPaymentsMaintenance(): Promise<Record<string, number>> {
  const db = systemClient()
  const now = new Date()
  const stats = { expiredOffers: 0, paymentOpen: 0, unpaidCancelled: 0, captured: 0, settled: 0 }

  const { data: expired } = await db.rpc('expire_offers')
  stats.expiredOffers = expired ?? 0

  const { data: opening } = await db
    .from('visit_requests')
    .select('id, slot_at')
    .eq('status', 'acceptee')
    .is('payment_open_notified_at', null)
    .lte('slot_at', new Date(now.getTime() + PAYMENT_WINDOW_MS).toISOString())
    .gt('slot_at', now.toISOString())
  for (const r of opening ?? []) {
    await db.from('visit_requests').update({ payment_open_notified_at: now.toISOString() }).eq('id', r.id)
    await notify(null, { type: 'payment_open', requestId: r.id })
    stats.paymentOpen++
  }

  const { data: unpaid } = await db
    .from('visit_requests')
    .select('id')
    .eq('status', 'acceptee')
    .lte('slot_at', now.toISOString())
  for (const r of unpaid ?? []) {
    const reason = 'Paiement non reçu avant le rendez-vous'
    const { error } = await db.rpc('transition_request', {
      p_request_id: r.id,
      p_to: 'annulee',
      p_reason: reason,
    })
    if (!error) {
      await notify(null, { type: 'request_cancelled', requestId: r.id, reason })
      await settleCancellation(null, r.id)
      stats.unpaidCancelled++
    }
  }

  const { data: expiring } = await db
    .from('payments')
    .select('request_id, visit_requests!inner(status)')
    .eq('status', 'authorized')
    .lte('capture_before', new Date(now.getTime() + CAPTURE_MARGIN_MS).toISOString())
    .neq('visit_requests.status', 'annulee')
  for (const p of expiring ?? []) {
    await captureRequestPayment(db, p.request_id)
    stats.captured++
  }

  const { data: toSettle } = await db
    .from('payments')
    .select('request_id, visit_requests!inner(status)')
    .in('status', ['authorized', 'captured'])
    .eq('refunded_cents', 0)
    .eq('visit_requests.status', 'annulee')
  for (const requestId of new Set((toSettle ?? []).map((p) => p.request_id))) {
    await settleCancellation(null, requestId)
    stats.settled++
  }

  return stats
}
