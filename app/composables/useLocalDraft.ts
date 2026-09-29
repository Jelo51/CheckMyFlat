import type { RequestForm } from '~/utils/requestForm'

const KEY = 'cmf:draft-request:v1'

/**
 * Brouillon d'un visiteur non connecté, conservé dans le navigateur jusqu'à
 * l'inscription. Toute erreur d'accès au stockage est ignorée (navigation
 * privée, stockage bloqué) : le formulaire reste utilisable.
 */
export function useLocalDraft() {
  function read(): RequestForm | null {
    if (import.meta.server) return null
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as RequestForm) : null
    } catch {
      return null
    }
  }

  function write(form: RequestForm): void {
    if (import.meta.server) return
    try {
      localStorage.setItem(KEY, JSON.stringify(form))
    } catch {
      // stockage indisponible
    }
  }

  function clear(): void {
    if (import.meta.server) return
    try {
      localStorage.removeItem(KEY)
    } catch {
      // stockage indisponible
    }
  }

  return { read, write, clear }
}
