/** Ouvre une session Stripe Checkout pour la demande acceptée du client. */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { db, profile } = await requireUser(event)
  const { data: request } = await db.from('visit_requests').select('*').eq('id', id).maybeSingle()
  if (!request || request.user_id !== profile.id) {
    throw createError({ statusCode: 404, statusMessage: 'Demande introuvable' })
  }
  const url = await createCheckout(event, request, profile.email)
  return { url }
})
