import type { H3Event } from 'h3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Database, Tables } from '~~/app/types/database.types'
import type { AccountRole } from '#shared/schemas/account'

export type Profile = Tables<'profiles'>
export type UserClient = SupabaseClient<Database>

export interface AuthContext {
  userId: string
  profile: Profile
  /** Client au nom de l'utilisateur : la RLS s'applique. */
  db: UserClient
}

/** Client service role : contourne la RLS. Réservé au serveur. */
export function serviceClient(event: H3Event): UserClient {
  return serverSupabaseServiceRole<Database>(event)
}

let system: UserClient | null = null

/** Client service role hors requête HTTP (tâches planifiées). */
export function systemClient(): UserClient {
  if (system) return system
  const config = useRuntimeConfig()
  const key = config.supabase.secretKey || config.supabase.serviceKey
  if (!key) throw new Error('NUXT_SUPABASE_SECRET_KEY manquante')
  system = createClient<Database>(config.public.supabase.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return system
}

export async function requireUser(event: H3Event): Promise<AuthContext> {
  const claims = await serverSupabaseUser(event).catch(() => null)
  const userId = typeof claims?.sub === 'string' ? claims.sub : null
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  }
  const { data: profile } = await serviceClient(event).from('profiles').select('*').eq('id', userId).single()
  if (!profile) {
    throw createError({ statusCode: 401, statusMessage: 'Compte introuvable' })
  }
  if (profile.suspended_at) {
    throw createError({ statusCode: 403, statusMessage: 'Compte suspendu' })
  }
  return { userId, profile, db: await serverSupabaseClient<Database>(event) }
}

export async function requireRole(event: H3Event, roles: readonly AccountRole[]): Promise<AuthContext> {
  const ctx = await requireUser(event)
  if (!roles.includes(ctx.profile.role as AccountRole)) {
    throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
  }
  return ctx
}

export const requireAdmin = (event: H3Event) => requireRole(event, ['admin'])
