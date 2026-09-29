import type { Tables } from '~/types/database.types'
import type { AccountRole } from '#shared/schemas/account'

export type Profile = Tables<'profiles'>

/** Page d'accueil de chaque rôle après connexion. */
export const ROLE_HOME: Record<AccountRole, string> = {
  user: '/demandes',
  agent: '/agent/visites',
  admin: '/admin',
}

/**
 * Profil de l'utilisateur connecté, partagé entre le serveur et le client.
 * Rechargé quand l'utilisateur change (connexion, déconnexion).
 */
export function useProfile() {
  const user = useSupabaseUser()
  const supabase = useSupabaseClient()
  const profile = useState<Profile | null>('profile', () => null)
  const loadedFor = useState<string | null>('profile-loaded-for', () => null)

  async function refresh(): Promise<Profile | null> {
    // Juste après une connexion, `useSupabaseUser` n'est pas encore à jour :
    // on relit la session.
    const uid = user.value?.sub ?? (await supabase.auth.getClaims()).data?.claims?.sub ?? null
    if (!uid) {
      profile.value = null
      loadedFor.value = null
      return null
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    profile.value = data
    loadedFor.value = uid
    return data
  }

  /** Charge le profil si nécessaire (utilisé par le middleware). */
  async function ensure(): Promise<Profile | null> {
    const uid = user.value?.sub ?? null
    if (uid && loadedFor.value === uid) return profile.value
    return refresh()
  }

  const role = computed(() => (profile.value?.role ?? null) as AccountRole | null)
  const home = computed(() => (role.value ? ROLE_HOME[role.value] : '/'))

  return { user, profile, role, home, refresh, ensure }
}
