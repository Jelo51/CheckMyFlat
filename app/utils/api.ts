interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: Record<string, unknown> | FormData
  query?: Record<string, string | number | undefined>
}

/**
 * Appel des routes serveur. Enveloppe `$fetch` sans l'inférence de type par
 * route de Nitro, trop coûteuse pour TypeScript avec des URL construites.
 */
export function api<T = unknown>(url: string, options?: ApiOptions): Promise<T> {
  return ($fetch as unknown as (url: string, options?: ApiOptions) => Promise<T>)(url, options)
}
