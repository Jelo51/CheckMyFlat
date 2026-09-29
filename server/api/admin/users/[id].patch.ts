import { adminUserUpdateSchema } from '#shared/schemas/account'

/** Modifie un compte : coordonnées, rôle, suspension (bannissement Supabase Auth). */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { userId } = await requireAdmin(event)
  const input = await readValid(event, adminUserUpdateSchema)
  if (id === userId && ((input.role !== undefined && input.role !== 'admin') || input.suspended)) {
    throw createError({ statusCode: 409, statusMessage: 'Vous ne pouvez pas retirer vos propres droits' })
  }
  const admin = serviceClient(event)

  if (input.suspended !== undefined) {
    const { error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: input.suspended ? '876000h' : 'none',
    })
    if (error) throw createError({ statusCode: 502, statusMessage: 'Suspension impossible' })
  }

  const { data, error } = await admin
    .from('profiles')
    .update({
      ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.suspended !== undefined
        ? { suspended_at: input.suspended ? new Date().toISOString() : null }
        : {}),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) dbError(error)
  return data
})
