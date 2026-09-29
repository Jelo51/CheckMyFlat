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
  // Au rendu serveur, `useRequestFetch` transmet les cookies de session.
  type Fetcher = (url: string, options?: ApiOptions) => Promise<T>
  const fetcher = import.meta.server
    ? (useRequestFetch() as unknown as Fetcher)
    : ($fetch as unknown as Fetcher)
  return fetcher(url, options)
}
