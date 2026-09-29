import { z } from 'zod'

const schema = z.object({ agentId: z.uuid() })

/** Assigne (ou réassigne) un agent ; passe la demande payée en `planifiee`. */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { db } = await requireAdmin(event)
  const { agentId } = await readValid(event, schema)
  const { data, error } = await db.rpc('assign_agent', { p_request_id: id, p_agent_id: agentId })
  if (error) dbError(error)
  await notify(event, { type: 'visit_assigned', requestId: id })
  return { status: data?.status }
})
