/** Régénère le PDF (et livre le rapport si la génération avait échoué). */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  await requireAdmin(event)
  const path = await generateAndDeliverReport(event, id)
  return { path }
})
