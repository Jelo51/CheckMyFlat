import type { H3Event } from 'h3'
import { formatEuros, paymentOpensAt } from '#shared/domain/pricing'
import { formatDay, formatSlot } from '#shared/utils/time'
import { getChannels, type Recipient } from './notifications/channels'
import { renderEmail, type EmailContent } from './notifications/templates'

/** Événements métier qui déclenchent une notification. */
export type NotificationEvent =
  | { type: 'request_published'; requestId: string }
  | { type: 'offer_received'; requestId: string; amountCents: number; fromSide: 'client' | 'checkmyflat' }
  | { type: 'offer_accepted'; requestId: string }
  | { type: 'payment_open'; requestId: string }
  | { type: 'payment_confirmed'; requestId: string }
  | { type: 'visit_assigned'; requestId: string }
  | { type: 'report_delivered'; requestId: string }
  | { type: 'refund_issued'; requestId: string; amountCents: number; penaltyCents: number }
  | { type: 'request_cancelled'; requestId: string; reason: string }
  | { type: 'dispute_opened'; requestId: string; reason: string }

interface Letter {
  to: Recipient[]
  content: EmailContent
}

/**
 * Envoie les notifications d'un événement sur tous les canaux configurés.
 * Ne lève jamais : un email en échec ne doit pas annuler l'action métier.
 */
export async function notify(event: H3Event | null, notification: NotificationEvent): Promise<void> {
  try {
    const letters = await compose(event, notification)
    const channels = getChannels()
    await Promise.all(
      letters.flatMap((letter) => {
        const rendered = renderEmail(letter.content)
        return letter.to.flatMap((to) =>
          channels.map((channel) =>
            channel
              .send({ to, ...rendered })
              .catch((error) => console.error(`[notify] ${channel.name} ${notification.type}`, error)),
          ),
        )
      }),
    )
  } catch (error) {
    console.error('[notify]', notification.type, error)
  }
}

async function compose(event: H3Event | null, n: NotificationEvent): Promise<Letter[]> {
  const db = event ? serviceClient(event) : systemClient()
  const { data: request } = await db
    .from('visit_requests')
    .select(
      'id, reference, address, city, slot_at, agreed_price_cents, urgent_fee_cents, user_id, assigned_agent_id',
    )
    .eq('id', n.requestId)
    .single()
  if (!request) return []

  const [{ data: owner }, { data: agent }, { data: admins }] = await Promise.all([
    db.from('profiles').select('email, full_name, phone').eq('id', request.user_id).single(),
    request.assigned_agent_id
      ? db.from('profiles').select('email, full_name, phone').eq('id', request.assigned_agent_id).single()
      : Promise.resolve({ data: null }),
    db.from('profiles').select('email, full_name, phone').eq('role', 'admin').is('suspended_at', null),
  ])

  const site = useRuntimeConfig().public.siteUrl
  const client: Recipient[] = owner ? [{ email: owner.email, name: owner.full_name, phone: owner.phone }] : []
  const team: Recipient[] = (admins ?? []).map((a) => ({ email: a.email, name: a.full_name, phone: a.phone }))
  const visitor: Recipient[] = agent
    ? [{ email: agent.email, name: agent.full_name, phone: agent.phone }]
    : []

  const where = `${request.address ?? ''}, ${request.city ?? ''}`
  const slot = request.slot_at ? formatSlot(request.slot_at) : ''
  const ref = request.reference
  const clientUrl = `${site}/demandes/${request.id}`
  const adminUrl = `${site}/admin/demandes/${request.id}`

  switch (n.type) {
    case 'request_published':
      return [
        {
          to: team,
          content: {
            subject: `Nouvelle demande ${ref}`,
            heading: 'Nouvelle demande de visite',
            paragraphs: [`${where} — ${slot}.`, 'Le client attend votre réponse sur le prix.'],
            cta: { label: 'Ouvrir la demande', url: adminUrl },
          },
        },
      ]
    case 'offer_received':
      return n.fromSide === 'checkmyflat'
        ? [
            {
              to: client,
              content: {
                subject: `Nouvelle proposition de prix — ${ref}`,
                heading: `Nouvelle proposition : ${formatEuros(n.amountCents)}`,
                paragraphs: [
                  `Pour la visite du ${slot} (${where}).`,
                  'Vous pouvez l’accepter, contre-proposer ou nous écrire. La proposition est valable 48 h.',
                ],
                cta: { label: 'Répondre', url: clientUrl },
              },
            },
          ]
        : [
            {
              to: team,
              content: {
                subject: `Contre-proposition du client — ${ref}`,
                heading: `Le client propose ${formatEuros(n.amountCents)}`,
                paragraphs: [`${where} — ${slot}.`],
                cta: { label: 'Répondre', url: adminUrl },
              },
            },
          ]
    case 'offer_accepted': {
      const opens = request.slot_at ? paymentOpensAt(new Date(request.slot_at)) : null
      const openNow = !opens || opens <= new Date()
      return [
        {
          to: client,
          content: {
            subject: `Prix accepté — ${ref}`,
            heading: 'Le prix est fixé',
            paragraphs: [
              `Visite du ${slot} (${where}) : ${formatEuros((request.agreed_price_cents ?? 0) + request.urgent_fee_cents)}.`,
              openNow
                ? 'Vous pouvez régler dès maintenant. Une empreinte bancaire est posée ; le débit a lieu après la visite.'
                : `Le paiement ouvrira le ${formatDay(opens!)}, 7 jours avant le rendez-vous. Nous vous préviendrons.`,
            ],
            cta: openNow
              ? { label: 'Payer', url: `${clientUrl}/paiement` }
              : { label: 'Voir la demande', url: clientUrl },
          },
        },
        {
          to: team,
          content: {
            subject: `Prix accepté — ${ref}`,
            heading: 'Accord sur le prix',
            paragraphs: [`${where} — ${slot} : ${formatEuros(request.agreed_price_cents ?? 0)}.`],
            cta: { label: 'Ouvrir la demande', url: adminUrl },
          },
        },
      ]
    }
    case 'payment_open':
      return [
        {
          to: client,
          content: {
            subject: `Paiement ouvert — ${ref}`,
            heading: 'Vous pouvez régler votre visite',
            paragraphs: [
              `Visite du ${slot} (${where}).`,
              'Réglez avant le rendez-vous pour confirmer la visite. Le débit a lieu après la visite.',
            ],
            cta: { label: 'Payer', url: `${clientUrl}/paiement` },
          },
        },
      ]
    case 'payment_confirmed':
      return [
        {
          to: client,
          content: {
            subject: `Paiement confirmé — ${ref}`,
            heading: 'Paiement confirmé',
            paragraphs: [
              `Votre visite du ${slot} (${where}) est confirmée.`,
              'Nous vous prévenons dès qu’un visiteur est assigné. Le rapport vous parvient sous 24 h après la visite.',
            ],
            cta: { label: 'Suivre la demande', url: clientUrl },
          },
        },
        {
          to: team,
          content: {
            subject: `Visite payée, à assigner — ${ref}`,
            heading: 'Visite payée',
            paragraphs: [`${where} — ${slot}. Assignez un visiteur.`],
            cta: { label: 'Assigner', url: adminUrl },
          },
        },
      ]
    case 'visit_assigned':
      return [
        {
          to: visitor,
          content: {
            subject: `Visite assignée — ${slot}`,
            heading: 'Une visite vous est assignée',
            paragraphs: [
              `${where}, le ${slot}.`,
              'Consultez les consignes du client avant de vous y rendre.',
            ],
            cta: { label: 'Voir la visite', url: `${site}/agent/visites/${request.id}` },
          },
        },
        {
          to: client,
          content: {
            subject: `Visiteur assigné — ${ref}`,
            heading: 'Un visiteur est assigné',
            paragraphs: [`Il se rendra au ${where} le ${slot}.`],
            cta: { label: 'Suivre la demande', url: clientUrl },
          },
        },
      ]
    case 'report_delivered':
      return [
        {
          to: client,
          content: {
            subject: `Votre rapport de visite est prêt — ${ref}`,
            heading: 'Votre rapport est prêt',
            paragraphs: [
              `Visite du ${slot} (${where}).`,
              'Notes, photos, points à négocier et réserves : tout est dans le rapport.',
            ],
            cta: { label: 'Lire le rapport', url: `${site}/rapports/${request.id}` },
          },
        },
      ]
    case 'refund_issued':
      return [
        {
          to: client,
          content: {
            subject: `Remboursement — ${ref}`,
            heading: `Remboursement de ${formatEuros(n.amountCents)}`,
            paragraphs: [
              `Visite du ${slot} (${where}).`,
              n.penaltyCents > 0
                ? `Annulation moins de 24 h avant le rendez-vous : ${formatEuros(n.penaltyCents)} sont retenus selon la zone.`
                : 'Le montant est intégralement restitué.',
              'Selon votre banque, le remboursement apparaît sous 5 à 10 jours ouvrés. Une empreinte non débitée est simplement libérée.',
            ],
          },
        },
      ]
    case 'request_cancelled':
      return [
        {
          to: [...client, ...team, ...visitor],
          content: {
            subject: `Demande annulée — ${ref}`,
            heading: 'Demande annulée',
            paragraphs: [`Visite du ${slot} (${where}).`, `Motif : ${n.reason}`],
          },
        },
      ]
    case 'dispute_opened':
      return [
        {
          to: team,
          content: {
            subject: `Litige ouvert — ${ref}`,
            heading: 'Le client conteste la visite',
            paragraphs: [`${where} — ${slot}.`, `Motif : ${n.reason}`],
            cta: { label: 'Ouvrir la demande', url: adminUrl },
          },
        },
      ]
  }
}
