import { visitReportDraftSchema, visitReportSubmitSchema } from '#shared/schemas/visitReport'

/**
 * Soumission du compte rendu : validation (même schéma que le client),
 * `submit_report` (contrôles SQL + transition `realisee`), capture du
 * paiement, puis génération et livraison du PDF (`rapport_livre`).
 * Le PDF et la capture sont rejouables si une étape échoue.
 */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const visit = await requireAssignedVisit(event, id)
  const { db } = visit.ctx
  const report = await ensureReport(visit)

  const [blocks, { count }] = await Promise.all([
    loadScoringBlocks(db),
    db.from('report_media').select('id', { count: 'exact', head: true }).eq('report_id', report.id),
  ])

  // Relecture de l'état enregistré : c'est lui qui est soumis.
  const { data: saved } = await db
    .from('visit_reports')
    .select('*, report_scores(criterion_id, score, comment), report_reserves(text, media_id, position)')
    .eq('id', report.id)
    .single()
  const draft = visitReportDraftSchema.parse({
    scores: Object.fromEntries(
      (saved?.report_scores ?? []).map((s) => [s.criterion_id, { score: s.score, comment: s.comment }]),
    ),
    globalScore:
      saved?.global_score === null || saved?.global_score === undefined ? null : Number(saved.global_score),
    justification: saved?.justification,
    filmingRefused: saved?.filming_refused ?? false,
    negotiationPoints: (saved?.negotiation_points as string[]) ?? [],
    reserves: (saved?.report_reserves ?? []).map((r) => ({ text: r.text, mediaId: r.media_id })),
    conclusion: saved?.conclusion,
    recommendation: saved?.recommendation,
  })
  const parsed = visitReportSubmitSchema({ blocks, mediaCount: count ?? 0 }).safeParse(draft)
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: parsed.error.issues[0]?.message ?? 'Compte rendu incomplet',
      data: { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    })
  }

  const { error } = await db.rpc('submit_report', { p_request_id: id })
  if (error) dbError(error)

  // La visite a eu lieu : on débite l'empreinte.
  await captureRequestPayment(serviceClient(event), id)

  try {
    await generateAndDeliverReport(event, id)
    return { status: 'rapport_livre' }
  } catch (e) {
    console.error('[rapport] génération', id, e)
    return { status: 'realisee', pdfPending: true }
  }
})
