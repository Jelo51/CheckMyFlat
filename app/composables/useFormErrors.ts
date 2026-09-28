import type { ZodType } from 'zod'

/**
 * Validation Zod côté client : mêmes schémas que le serveur, erreurs par
 * champ (premier message) et erreur globale.
 */
export function useFormErrors() {
  const errors = ref<Record<string, string>>({})
  const formError = ref<string | null>(null)

  function validate<T>(schema: ZodType<T>, value: unknown): T | null {
    errors.value = {}
    formError.value = null
    const result = schema.safeParse(value)
    if (result.success) return result.data
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_'
      errors.value[key] ??= issue.message
    }
    formError.value = 'Corrigez les champs signalés.'
    return null
  }

  /** Message d'une erreur $fetch / Supabase, en français si possible. */
  function fromError(error: unknown, fallback = 'Une erreur est survenue. Réessayez.') {
    const e = error as {
      data?: { statusMessage?: string; message?: string }
      statusMessage?: string
      message?: string
    }
    formError.value = e?.data?.statusMessage ?? e?.statusMessage ?? fallback
  }

  function reset() {
    errors.value = {}
    formError.value = null
  }

  return { errors, formError, validate, fromError, reset }
}
