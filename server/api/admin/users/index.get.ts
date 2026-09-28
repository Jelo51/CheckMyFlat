/**
 * Comptes avec activité : nombre de demandes, montant dépensé (capturé moins
 * remboursé) et vérification de l'email.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const admin = serviceClient(event)

  const [{ data: profiles }, { data: requests }, { data: payments }] = await Promise.all([
    admin.from('profiles').select('*').order('created_at', { ascending: false }),
    admin.from('visit_requests').select('user_id'),
    admin.from('payments').select('captured_cents, refunded_cents, visit_requests!inner(user_id)'),
  ])

  const confirmed = new Map<string, boolean>()
  for (let page = 1; page < 50; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    for (const u of data.users) confirmed.set(u.id, !!u.email_confirmed_at)
    if (data.users.length < 1000) break
  }

  const requestCount = new Map<string, number>()
  for (const r of requests ?? []) requestCount.set(r.user_id, (requestCount.get(r.user_id) ?? 0) + 1)
  const spent = new Map<string, number>()
  for (const p of payments ?? []) {
    const uid = p.visit_requests.user_id
    spent.set(uid, (spent.get(uid) ?? 0) + p.captured_cents - p.refunded_cents)
  }

  return (profiles ?? []).map((p) => ({
    ...p,
    emailConfirmed: confirmed.get(p.id) ?? false,
    requestCount: requestCount.get(p.id) ?? 0,
    spentCents: spent.get(p.id) ?? 0,
  }))
})
