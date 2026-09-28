import { formToDraft } from '~/utils/requestForm'
import { safeNext } from '#shared/utils/url'

/**
 * Après connexion ou inscription : rattache le brouillon du visiteur s'il y
 * en a un, puis redirige vers sa relecture, ou vers la page demandée.
 */
export function useAfterAuth() {
  const { refresh, home, role } = useProfile()
  const localDraft = useLocalDraft()

  return async function afterAuth(next?: unknown) {
    await refresh()
    if (role.value === 'user') {
      const form = localDraft.read()
      const { id } = await api<{ id: string | null }>('/api/requests/attach-draft', {
        method: 'POST',
        body: { draft: form ? formToDraft(form) : null },
      })
      localDraft.clear()
      if (id) return navigateTo({ path: `/demandes/${id}/modifier`, query: { rattache: '1' } })
    }
    return navigateTo(safeNext(next) ?? home.value)
  }
}
