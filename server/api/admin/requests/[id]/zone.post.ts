import { z } from 'zod'

const schema = z.object({ zoneId: z.uuid() })

/** Fixe la zone tarifaire (adresse non reconnue ou correction). */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { db } = await requireAdmin(event)
  const { zoneId } = await readValid(event, schema)
  const { error } = await db.rpc('set_request_zone', { p_request_id: id, p_zone_id: zoneId })
  if (error) dbError(error)
  return { zoneId }
})
