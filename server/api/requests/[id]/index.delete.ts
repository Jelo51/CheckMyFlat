/**
 * Suppression : définitive avant paiement ; après paiement, la demande est
 * conservée (comptabilité) mais le rapport et ses fichiers sont supprimés.
 */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { db } = await requireUser(event)
  const admin = serviceClient(event)

  const { data: report } = await admin
    .from('visit_reports')
    .select('pdf_path, report_media(storage_path)')
    .eq('request_id', id)
    .maybeSingle()

  const { data: mode, error } = await db.rpc('delete_request', { p_request_id: id })
  if (error) dbError(error)

  const media = (report?.report_media ?? []).map((m) => m.storage_path)
  if (media.length) await admin.storage.from('report-media').remove(media)
  if (report?.pdf_path) await admin.storage.from('report-pdf').remove([report.pdf_path])
  return { mode }
})
