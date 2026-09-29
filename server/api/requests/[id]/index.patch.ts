import { z } from 'zod'
import { draftToColumns, requestDraftSchema } from '#shared/schemas/request'
import type { TablesUpdate } from '~~/app/types/database.types'

const schema = z.object({ draft: requestDraftSchema })

/**
 * Modifie une demande (brouillon, publiée ou en négociation ; la RLS refuse
 * au-delà). Si l'adresse change après publication, la zone est recalculée.
 */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { db } = await requireUser(event)
  const { draft } = await readValid(event, schema)

  const { data, error } = await db
    .from('visit_requests')
    .update(draftToColumns(draft) as TablesUpdate<'visit_requests'>)
    .eq('id', id)
    .select('*')
  if (error) dbError(error)
  const row = data?.[0]
  if (!row) throw createError({ statusCode: 409, statusMessage: 'Cette demande n’est plus modifiable' })

  const addressChanged = ['address', 'postalCode', 'city', 'lat', 'lng'].some((k) => k in draft)
  if (row.status !== 'brouillon' && addressChanged && row.address && row.postal_code && row.city) {
    const place = await placeOf({
      address: row.address,
      postalCode: row.postal_code,
      city: row.city,
      lat: 'lat' in draft ? row.lat : null,
      lng: 'lng' in draft ? row.lng : null,
    })
    const zone = await findZone(event, place)
    await serviceClient(event)
      .from('visit_requests')
      .update({ zone_id: zone?.id ?? null, lat: place.lat, lng: place.lng })
      .eq('id', id)
  }
  return { id }
})
