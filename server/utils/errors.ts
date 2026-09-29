import type { ZodType } from 'zod'
import type { H3Event } from 'h3'

interface DbError {
  code?: string
  message?: string
}

/** SQLSTATE applicatifs levés par les fonctions Postgres → statut HTTP. */
const DB_STATUS: Record<string, number> = {
  CMF01: 409,
  CMF02: 409,
  CMF03: 401,
  CMF04: 404,
  CMF05: 403,
  CMF06: 422,
  '42501': 403,
  '23514': 422,
  PGRST116: 404,
}

/**
 * Convertit une erreur Supabase/Postgres en erreur HTTP. Les messages CMF*
 * sont rédigés pour l'utilisateur ; les autres restent génériques.
 */
export function dbError(error: DbError | null | undefined, fallback = 'Opération impossible'): never {
  const code = error?.code ?? ''
  const statusCode = DB_STATUS[code] ?? 500
  const statusMessage = code.startsWith('CMF') && error?.message ? error.message : fallback
  if (statusCode === 500) console.error('[db]', error)
  throw createError({ statusCode, statusMessage })
}

/** Lève si `error` est défini, sinon renvoie `data` non nul. */
export function must<T>(result: { data: T | null; error: DbError | null }, fallback?: string): T {
  if (result.error) dbError(result.error, fallback)
  if (result.data === null) throw createError({ statusCode: 404, statusMessage: 'Introuvable' })
  return result.data
}

export async function readValid<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  const body = await readBody(event).catch(() => undefined)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: parsed.error.issues[0]?.message ?? 'Données invalides',
      data: { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    })
  }
  return parsed.data
}

export function routeId(event: H3Event, name = 'id'): string {
  const value = getRouterParam(event, name) ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    throw createError({ statusCode: 404, statusMessage: 'Introuvable' })
  }
  return value
}
