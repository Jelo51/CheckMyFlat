import { visitReportDraftSchema } from '#shared/schemas/visitReport'

/**
 * Sauvegarde automatique du compte rendu (brouillon). Écrit avec le client
 * de l'agent : la RLS vérifie l'assignation et l'état de la visite.
 */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const visit = await requireAssignedVisit(event, id)
  const draft = await readValid(event, visitReportDraftSchema)
  const report = await ensureReport(visit)
  const { db } = visit.ctx

  const { error } = await db
    .from('visit_reports')
    .update({
      filming_refused: draft.filmingRefused,
      global_score: draft.globalScore ?? null,
      justification: draft.justification ?? null,
      negotiation_points: draft.negotiationPoints,
      conclusion: draft.conclusion ?? null,
      recommendation: draft.recommendation ?? null,
    })
    .eq('id', report.id)
  if (error) dbError(error)

  const scores = Object.entries(draft.scores).map(([criterionId, entry]) => ({
    report_id: report.id,
    criterion_id: criterionId,
    score: entry.score,
    comment: entry.comment ?? null,
  }))
  if (scores.length) {
    const { error: scoreError } = await db.from('report_scores').upsert(scores)
    if (scoreError) dbError(scoreError)
  }

  // Les réserves sont remplacées en bloc (liste ordonnée).
  const { error: deleteError } = await db.from('report_reserves').delete().eq('report_id', report.id)
  if (deleteError) dbError(deleteError)
  if (draft.reserves.length) {
    const { error: reserveError } = await db.from('report_reserves').insert(
      draft.reserves.map((r, position) => ({
        report_id: report.id,
        text: r.text,
        media_id: r.mediaId ?? null,
        position,
      })),
    )
    if (reserveError) dbError(reserveError)
  }

  return { savedAt: new Date().toISOString() }
})
