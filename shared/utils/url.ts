/** N'accepte que des chemins internes (pas de redirection ouverte). */
export function safeNext(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : null
}
