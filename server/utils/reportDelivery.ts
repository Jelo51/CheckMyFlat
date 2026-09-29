import type { H3Event } from 'h3'
import { RECOMMENDATION_LABELS, type Recommendation } from '#shared/schemas/visitReport'
import { PROPERTY_TYPE_LABELS, type PropertyType } from '#shared/schemas/request'
import { formatDay, formatSlot } from '#shared/utils/time'
import { buildReportPdf, type ReportPdfData, type ReportPdfFonts } from './pdf/reportPdf'

const FONT_FILES = {
  regular: 'public-sans-latin-400-normal.ttf',
  semibold: 'public-sans-latin-600-normal.ttf',
  display: 'bricolage-grotesque-latin-700-normal.ttf',
  mono: 'ibm-plex-mono-latin-600-normal.ttf',
} as const

let fonts: ReportPdfFonts | null = null

/** Polices embarquées dans le build (serverAssets `fonts`). */
async function loadFonts(): Promise<ReportPdfFonts> {
  if (fonts) return fonts
  const storage = useStorage('assets:fonts')
  const entries = await Promise.all(
    Object.entries(FONT_FILES).map(async ([key, file]) => {
      const raw = await storage.getItemRaw<Buffer | Uint8Array>(file)
      if (!raw) throw new Error(`Police manquante : ${file}`)
      return [key, Buffer.from(raw)] as const
    }),
  )
  fonts = Object.fromEntries(entries) as unknown as ReportPdfFonts
  return fonts
}

/**
 * Génère le PDF d'un rapport soumis, le dépose dans le stockage privé et,
 * si la visite est `realisee`, livre le rapport (`rapport_livre`) et
 * prévient le client. Rejouable sans effet de bord (régénération).
 */
export async function generateAndDeliverReport(event: H3Event | null, requestId: string): Promise<string> {
  const db = event ? serviceClient(event) : systemClient()

  const { data: request } = await db.from('visit_requests').select('*').eq('id', requestId).single()
  const { data: report } = await db
    .from('visit_reports')
    .select(
      '*, report_scores(criterion_id, score, comment), report_media(id, kind, mime, storage_path, position), report_reserves(text, media_id, position)',
    )
    .eq('request_id', requestId)
    .single()
  if (
    !request ||
    !report ||
    report.status !== 'submitted' ||
    report.global_score === null ||
    report.weighted_score === null
  ) {
    throw createError({ statusCode: 409, statusMessage: 'Compte rendu non soumis' })
  }
  const { data: blocks } = await db
    .from('criteria_blocks')
    .select('label, weight, position, criteria(id, label, position, active)')
    .order('position')

  const scoreBy = new Map(report.report_scores.map((s) => [s.criterion_id, s]))
  const media = [...report.report_media].sort((a, b) => a.position - b.position)
  const photos = media.filter((m) => m.kind === 'photo')
  const photoNumber = new Map(photos.map((p, i) => [p.id, i + 1]))

  // Photos de l'annexe (JPEG/PNG, formats lus par pdfkit).
  const annexPhotos: ReportPdfData['photos'] = []
  for (const photo of photos) {
    if (!/^image\/(jpeg|png)$/.test(photo.mime)) continue
    const { data: blob } = await db.storage.from('report-media').download(photo.storage_path)
    if (blob)
      annexPhotos.push({ number: photoNumber.get(photo.id)!, data: Buffer.from(await blob.arrayBuffer()) })
  }

  const type = request.property_type
    ? PROPERTY_TYPE_LABELS[request.property_type as PropertyType]
    : 'Logement'
  const deliveredAt = report.delivered_at ? new Date(report.delivered_at) : new Date()
  const data: ReportPdfData = {
    reference: request.reference,
    title: `${type} · ${request.address}, ${request.city}`,
    address: `${request.address}, ${request.postal_code} ${request.city}`,
    visitedAt: request.slot_at ? formatSlot(request.slot_at) : '',
    deliveredAt: formatDay(deliveredAt),
    filmingRefused: report.filming_refused,
    photoCount: photos.length,
    videoCount: media.length - photos.length,
    globalScore: Number(report.global_score),
    weightedScore: Number(report.weighted_score),
    justification: report.justification,
    blocks: (blocks ?? []).map((b) => {
      const criteria = [...b.criteria]
        .filter((c) => c.active)
        .sort((x, y) => x.position - y.position)
        .map((c) => ({
          label: c.label,
          score: scoreBy.get(c.id)?.score ?? 0,
          comment: scoreBy.get(c.id)?.comment ?? null,
        }))
      const average = criteria.reduce((s, c) => s + c.score, 0) / Math.max(criteria.length, 1)
      return { label: b.label, weight: Number(b.weight), average, criteria }
    }),
    negotiationPoints: (report.negotiation_points as string[]) ?? [],
    reserves: [...report.report_reserves]
      .sort((a, b) => a.position - b.position)
      .map((r) => ({ text: r.text, photoNumber: r.media_id ? (photoNumber.get(r.media_id) ?? null) : null })),
    conclusion: report.conclusion ?? '',
    recommendation: report.recommendation
      ? RECOMMENDATION_LABELS[report.recommendation as Recommendation]
      : '',
    priorities: request.priorities,
    photos: annexPhotos,
  }

  const pdf = await buildReportPdf(data, await loadFonts())
  const path = `${requestId}/${request.reference}.pdf`
  const { error: uploadError } = await db.storage
    .from('report-pdf')
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true })
  if (uploadError) throw createError({ statusCode: 502, statusMessage: 'Stockage du rapport impossible' })

  await db
    .from('visit_reports')
    .update({ pdf_path: path, pdf_size_bytes: pdf.length, delivered_at: deliveredAt.toISOString() })
    .eq('id', report.id)

  if (request.status === 'realisee') {
    const { error } = await db.rpc('transition_request', {
      p_request_id: requestId,
      p_to: 'rapport_livre',
      p_reason: 'Rapport PDF généré',
    })
    if (error) dbError(error)
    await notify(event, { type: 'report_delivered', requestId })
  }
  return path
}
