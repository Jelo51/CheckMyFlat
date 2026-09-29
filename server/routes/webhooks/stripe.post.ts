/**
 * Webhook Stripe : signature vérifiée sur le corps brut, traitement
 * idempotent (table `stripe_events`). Une erreur renvoie 500 pour que Stripe
 * réessaie.
 */
export default defineEventHandler(async (event) => {
  const signature = getHeader(event, 'stripe-signature')
  const payload = await readRawBody(event, 'utf8')
  const secret = useRuntimeConfig(event).stripeWebhookSecret
  if (!signature || !payload || !secret) {
    throw createError({ statusCode: 400, statusMessage: 'Requête invalide' })
  }

  let stripeEvent
  try {
    stripeEvent = await stripe().webhooks.constructEventAsync(payload, signature, secret)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Signature invalide' })
  }

  await handleStripeEvent(event, stripeEvent)
  return { received: true }
})
