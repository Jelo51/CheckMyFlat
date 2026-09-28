import { cancelSchema } from '#shared/schemas/request'

/**
 * Annulation (client, admin, ou agent assigné pour une visite non réalisée).
 * Les paiements sont réglés immédiatement ; en cas d'échec Stripe, la tâche
 * planifiée rejoue le règlement.
 */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { db } = await requireUser(event)
  const { reason } = await readValid(event, cancelSchema)
  const { error } = await db.rpc('transition_request', {
    p_request_id: id,
    p_to: 'annulee',
    p_reason: reason,
  })
  if (error) dbError(error)
  await notify(event, { type: 'request_cancelled', requestId: id, reason })
  await settleCancellation(event, id)
  return { status: 'annulee' }
})
