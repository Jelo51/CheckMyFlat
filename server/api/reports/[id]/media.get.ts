/**
 * Médias d'un rapport avec URL signées (1 h). L'accès est vérifié par la RLS :
 * la liste est lue avec le client de l'utilisateur.
 */
export default defineEventHandler(async (event) => {
  const requestId = routeId(event)
  const { db } = await requireUser(event)
  const { data: report } = await db
    .from('visit_reports')
    .select(
      'id, report_media(id, kind, mime, storage_path, size_bytes, width, height, duration_seconds, position)',
    )
    .eq('request_id', requestId)
    .maybeSingle()
  if (!report) throw createError({ statusCode: 404, statusMessage: 'Rapport introuvable' })

  const media = [...report.report_media].sort((a, b) => a.position - b.position)
  if (!media.length) return []
  const { data: signed } = await serviceClient(event)
    .storage.from('report-media')
    .createSignedUrls(
      media.map((m) => m.storage_path),
      3600,
    )
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
  return media.map(({ storage_path, ...m }) => ({ ...m, url: urls.get(storage_path) ?? null }))
})
