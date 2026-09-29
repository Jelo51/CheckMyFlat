import { disputeSchema } from '#shared/schemas/request'

/** Ouverture d'un litige après la visite. */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { db } = await requireUser(event)
  const { reason } = await readValid(event, disputeSchema)
  const { error } = await db.rpc('transition_request', { p_request_id: id, p_to: 'litige', p_reason: reason })
  if (error) dbError(error)
  await notify(event, { type: 'dispute_opened', requestId: id, reason })
  return { status: 'litige' }
})
