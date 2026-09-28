/**
 * Suppression d'un compte. Impossible s'il existe un paiement (obligation
 * comptable) : il faut alors suspendre le compte.
 */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { userId } = await requireAdmin(event)
  if (id === userId)
    throw createError({ statusCode: 409, statusMessage: 'Vous ne pouvez pas supprimer votre compte' })
  const admin = serviceClient(event)

  const { data: requests } = await admin.from('visit_requests').select('id').eq('user_id', id)
  const requestIds = (requests ?? []).map((r) => r.id)
  if (requestIds.length) {
    const { count } = await admin
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('request_id', requestIds)
      .not('status', 'in', '(pending,canceled,failed)')
    if (count) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Ce compte a des paiements : suspendez-le plutôt (conservation comptable)',
      })
    }
    await admin.from('payments').delete().in('request_id', requestIds)
    await admin.from('visit_reports').delete().in('request_id', requestIds)
    const { error } = await admin.from('visit_requests').delete().in('id', requestIds)
    if (error) dbError(error)
  }

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) throw createError({ statusCode: 502, statusMessage: 'Suppression impossible' })
  return { deleted: id }
})
