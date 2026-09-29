import { adminUserCreateSchema } from '#shared/schemas/account'

/** Invite un compte (email d'invitation Supabase) et lui attribue son rôle. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const input = await readValid(event, adminUserCreateSchema)
  const admin = serviceClient(event)
  const site = useRuntimeConfig(event).public.siteUrl

  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.fullName },
    redirectTo: `${site}/nouveau-mot-de-passe`,
  })
  if (error || !data.user) {
    throw createError({
      statusCode: error?.code === 'email_exists' ? 409 : 502,
      statusMessage:
        error?.code === 'email_exists' ? 'Un compte existe déjà avec cet email' : 'Invitation impossible',
    })
  }
  const { error: roleError } = await admin
    .from('profiles')
    .update({ role: input.role, full_name: input.fullName })
    .eq('id', data.user.id)
  if (roleError) dbError(roleError)
  return { id: data.user.id }
})
