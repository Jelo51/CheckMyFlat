/** Message lisible d'une erreur $fetch (statusMessage posé par le serveur). */
export function errorMessage(error: unknown, fallback = 'Une erreur est survenue. Réessayez.'): string {
  const e = error as { data?: { statusMessage?: string }; statusMessage?: string } | null
  return e?.data?.statusMessage ?? e?.statusMessage ?? fallback
}
