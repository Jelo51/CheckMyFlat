import type { H3Event } from 'h3'
import type { ScoringBlock } from '#shared/domain/scoring'
import type { Tables } from '~~/app/types/database.types'
import type { AuthContext } from './auth'

export interface AssignedVisit {
  ctx: AuthContext
  request: Tables<'visit_requests'>
}

/** Visite assignée à l'appelant (agent, ou admin qui s'est assigné). */
export async function requireAssignedVisit(event: H3Event, requestId: string): Promise<AssignedVisit> {
  const ctx = await requireRole(event, ['agent', 'admin'])
  const { data: request } = await ctx.db.from('visit_requests').select('*').eq('id', requestId).maybeSingle()
  if (!request || request.assigned_agent_id !== ctx.userId) {
    throw createError({ statusCode: 404, statusMessage: 'Visite introuvable' })
  }
  return { ctx, request }
}

/** La visite accepte encore des modifications (planifiée, compte rendu en brouillon). */
export function assertWritable(request: Tables<'visit_requests'>, report: Tables<'visit_reports'> | null) {
  if (request.status !== 'planifiee' || (report && report.status !== 'draft')) {
    throw createError({ statusCode: 409, statusMessage: 'Le compte rendu a déjà été soumis' })
  }
}

/** Crée le brouillon de compte rendu s'il n'existe pas encore. */
export async function ensureReport(visit: AssignedVisit): Promise<Tables<'visit_reports'>> {
  const { db } = visit.ctx
  const { data: existing } = await db
    .from('visit_reports')
    .select('*')
    .eq('request_id', visit.request.id)
    .maybeSingle()
  assertWritable(visit.request, existing)
  if (existing) return existing
  const created = await db.from('visit_reports').insert({ request_id: visit.request.id }).select('*').single()
  return must(created)
}

/** Blocs de notation (poids et critères actifs), lus en base. */
export async function loadScoringBlocks(db: AuthContext['db']): Promise<ScoringBlock[]> {
  const { data } = await db
    .from('criteria_blocks')
    .select('id, weight, criteria(id, active)')
    .order('position')
  return (data ?? []).map((b) => ({
    id: b.id,
    weight: Number(b.weight),
    criterionIds: b.criteria.filter((c) => c.active).map((c) => c.id),
  }))
}

export async function settingNumber(db: AuthContext['db'], key: string, fallback: number): Promise<number> {
  const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle()
  const n = Number(data?.value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Refuse l'ajout si le volume de médias de la visite dépasse la limite paramétrée. */
export async function assertQuota(db: AuthContext['db'], reportId: string, extra: number) {
  const max = await settingNumber(db, 'max_media_bytes_per_visit', 500 * 1024 * 1024)
  const { data } = await db.from('report_media').select('size_bytes').eq('report_id', reportId)
  const used = (data ?? []).reduce((sum, m) => sum + Number(m.size_bytes), 0)
  if (used + extra > max) {
    throw createError({
      statusCode: 422,
      statusMessage: `Volume maximal atteint (${Math.round(max / 1024 / 1024)} Mo par visite)`,
    })
  }
}
