import { draftToColumns, requestPublishSchema } from '#shared/schemas/request'
import type { TablesUpdate } from '~~/app/types/database.types'

/**
 * Publie un brouillon : enregistre les derniers champs, calcule la zone
 * (géocodage si besoin), puis `publish_request` (transition + proposition
 * initiale du client). Le supplément 48 h est calculé par la base.
 */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { db } = await requireUser(event)
  const { consent: _consent, ...fields } = await readValid(event, requestPublishSchema())

  const place = await placeOf(fields)
  const zone = await findZone(event, place)

  const { data, error } = await db
    .from('visit_requests')
    .update({
      ...(draftToColumns(fields) as TablesUpdate<'visit_requests'>),
      consent_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'brouillon')
    .select('id')
  if (error) dbError(error)
  if (!data?.length) throw createError({ statusCode: 409, statusMessage: 'Cette demande est déjà publiée' })

  const { error: zoneError } = await serviceClient(event)
    .from('visit_requests')
    .update({ zone_id: zone?.id ?? null, lat: place.lat, lng: place.lng })
    .eq('id', id)
  if (zoneError) dbError(zoneError)

  const { error: publishError } = await db.rpc('publish_request', { p_request_id: id })
  if (publishError) dbError(publishError)

  await notify(event, { type: 'request_published', requestId: id })
  return { id, zone: zone ? { label: zone.label, basePriceCents: zone.base_price_cents } : null }
})
