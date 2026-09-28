/**
 * Lien de téléchargement du PDF (URL signée, 5 min). Réservé au client
 * propriétaire (rapport livré), à l'agent assigné et aux admins : l'accès
 * est vérifié par la RLS. Le PDF est régénéré s'il manque.
 */
export default defineEventHandler(async (event) => {
  const requestId = routeId(event)
  const { db } = await requireUser(event)
  const { data: report } = await db
    .from('visit_reports')
    .select('pdf_path, status')
    .eq('request_id', requestId)
    .maybeSingle()
  if (!report || report.status !== 'submitted') {
    throw createError({ statusCode: 404, statusMessage: 'Rapport introuvable' })
  }
  const path = report.pdf_path ?? (await generateAndDeliverReport(event, requestId))
  const { data, error } = await serviceClient(event)
    .storage.from('report-pdf')
    .createSignedUrl(path, 300, { download: path.split('/').pop() })
  if (error || !data) {
    // Fichier absent du stockage : on le reconstruit.
    const rebuilt = await generateAndDeliverReport(event, requestId)
    const retry = await serviceClient(event)
      .storage.from('report-pdf')
      .createSignedUrl(rebuilt, 300, { download: true })
    if (!retry.data) throw createError({ statusCode: 502, statusMessage: 'Rapport indisponible' })
    return { url: retry.data.signedUrl }
  }
  return { url: data.signedUrl }
})
