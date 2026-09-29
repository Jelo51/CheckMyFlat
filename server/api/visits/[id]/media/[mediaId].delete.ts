/** Supprime un média du compte rendu en cours. */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const mediaId = routeId(event, 'mediaId')
  const visit = await requireAssignedVisit(event, id)
  const report = await ensureReport(visit)
  const admin = serviceClient(event)

  const { data: media } = await admin
    .from('report_media')
    .select('id, storage_path')
    .eq('id', mediaId)
    .eq('report_id', report.id)
    .maybeSingle()
  if (!media) throw createError({ statusCode: 404, statusMessage: 'Média introuvable' })

  await admin.storage.from('report-media').remove([media.storage_path])
  const { error } = await admin.from('report_media').delete().eq('id', media.id)
  if (error) dbError(error)
  return { deleted: media.id }
})
