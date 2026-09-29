import type { AccountRole } from '#shared/schemas/account'

declare module '#app' {
  interface PageMeta {
    /** Page réservée aux comptes connectés. */
    auth?: boolean
    /** Rôles autorisés (implique `auth`). */
    roles?: AccountRole[]
    /** Page réservée aux non-connectés (connexion, inscription). */
    guestOnly?: boolean
  }
}

/**
 * Contrôle d'accès par rôle. La sécurité réelle est assurée par la RLS et
 * les routes serveur ; ce middleware évite d'afficher des pages inutilisables.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, ensure, home } = useProfile()
  const needsAuth = to.meta.auth || !!to.meta.roles?.length
  if (!needsAuth && !to.meta.guestOnly) return

  // Juste après une connexion, `useSupabaseUser` peut ne pas être encore à
  // jour : on relit la session.
  const signedIn = !!user.value || !!(await useSupabaseClient().auth.getClaims()).data?.claims?.sub

  if (to.meta.guestOnly && signedIn) {
    await ensure()
    return navigateTo(home.value)
  }

  if (!needsAuth) return

  if (!signedIn) {
    return navigateTo({ path: '/connexion', query: { next: to.fullPath } })
  }

  const profile = await ensure()
  if (!profile) {
    return navigateTo({ path: '/connexion', query: { next: to.fullPath } })
  }
  if (profile.suspended_at) {
    await useSupabaseClient().auth.signOut()
    return navigateTo({ path: '/connexion', query: { suspendu: '1' } })
  }
  if (to.meta.roles?.length && !to.meta.roles.includes(profile.role as AccountRole)) {
    return navigateTo(home.value)
  }
})
