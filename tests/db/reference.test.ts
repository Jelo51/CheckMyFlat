import { afterAll, describe, expect, it } from 'vitest'
import { TRANSITIONS } from '#shared/domain/stateMachine'
import {
  OFFER_VALIDITY_MS,
  PAYMENT_WINDOW_MS,
  LATE_CANCEL_WINDOW_MS,
  URGENT_FEE_CENTS,
  URGENT_WINDOW_MS,
  resolveZone,
  type ZoneRule,
} from '#shared/domain/pricing'
import { weightedScore, roundScore, weightsAreValid, type ScoringBlock } from '#shared/domain/scoring'
import { closePool, tx, IDS } from './helpers'

afterAll(closePool)

const HOUR = 3600_000

describe('données de référence', () => {
  it('la table request_transitions est identique à la machine à états TypeScript', async () => {
    await tx(async (db) => {
      const rows = await db.query<{ from_status: string; to_status: string; actors: string }>(
        `select from_status, to_status, array_to_json(actors)::text as actors from public.request_transitions`,
      )
      const sql = rows
        .map((r) => `${r.from_status}>${r.to_status}:${(JSON.parse(r.actors) as string[]).sort().join(',')}`)
        .sort()
      const ts = TRANSITIONS.map((t) => `${t.from}>${t.to}:${[...t.actors].sort().join(',')}`).sort()
      expect(sql).toEqual(ts)
    })
  })

  it('les paramètres SQL correspondent aux constantes TypeScript', async () => {
    await tx(async (db) => {
      const rows = await db.query<{ key: string; value: number }>(
        `select key, (value #>> '{}')::int as value from public.app_settings`,
      )
      const s = Object.fromEntries(rows.map((r) => [r.key, r.value]))
      expect(s.urgent_fee_cents).toBe(URGENT_FEE_CENTS)
      expect(s.urgent_window_hours! * HOUR).toBe(URGENT_WINDOW_MS)
      expect(s.offer_validity_hours! * HOUR).toBe(OFFER_VALIDITY_MS)
      expect(s.payment_window_days! * 24 * HOUR).toBe(PAYMENT_WINDOW_MS)
      expect(s.late_cancel_window_hours! * HOUR).toBe(LATE_CANCEL_WINDOW_MS)
      expect(s.max_media_bytes_per_visit).toBe(500 * 1024 * 1024)
    })
  })

  it('14 critères en 4 blocs (3, 4, 4, 3), poids 25/30/25/20', async () => {
    await tx(async (db) => {
      const blocks = await db.query<{ code: string; weight: string; n: number }>(`
        select b.code, b.weight, count(c.id)::int as n
        from public.criteria_blocks b join public.criteria c on c.block_id = b.id and c.active
        group by b.id order by b.position`)
      expect(blocks.map((b) => [b.code, Number(b.weight), b.n])).toEqual([
        ['localisation', 0.25, 3],
        ['qualite', 0.3, 4],
        ['agencement', 0.25, 4],
        ['immeuble', 0.2, 3],
      ])
      expect(weightsAreValid(blocks.map((b) => Number(b.weight)))).toBe(true)
      const surface = await db.one<{ label: string; block: string }>(`
        select c.label, b.code as block from public.criteria c join public.criteria_blocks b on b.id = c.block_id
        where c.code = 'surface_conforme'`)
      expect(surface).toEqual({ label: "Surface réelle conforme à l'annonce", block: 'qualite' })
    })
  })

  it('la moyenne pondérée SQL est identique au calcul TypeScript', async () => {
    await tx(async (db) => {
      const blocks = await db.query<{ id: string; weight: string; ids: string[] }>(`
        select b.id, b.weight, array_agg(c.id::text) as ids
        from public.criteria_blocks b join public.criteria c on c.block_id = b.id and c.active group by b.id`)
      const scoring: ScoringBlock[] = blocks.map((b) => ({
        id: b.id,
        weight: Number(b.weight),
        criterionIds: b.ids,
      }))
      for (const n of [7, 8, 10]) {
        const scores = await db.query<{ criterion_id: string; score: number }>(
          `select criterion_id, score from public.report_scores where report_id = $1`,
          [IDS.report(n)],
        )
        const map = Object.fromEntries(scores.map((s) => [s.criterion_id, s.score]))
        const sql = await db.one<{ w: string }>(`select public.report_weighted_score($1) as w`, [
          IDS.report(n),
        ])
        expect(Number(sql.w)).toBe(roundScore(weightedScore(scoring, map)!))
      }
    })
  })

  it('zones de Reims résolues à partir des règles en base', async () => {
    await tx(async (db) => {
      const rows = await db.query<{ code: string; priority: number; rule: ZoneRule }>(`
        select z.code, r.priority, r.rule from public.pricing_zone_rules r join public.pricing_zones z on z.id = r.zone_id`)
      const rules = rows.map((r) => ({ zoneId: r.code, priority: r.priority, rule: r.rule }))
      const zone = (lat: number, lng: number, commune: string) =>
        resolveZone({ point: { lat, lng }, commune }, rules)
      expect(zone(49.2547, 4.0266, 'Reims')).toBe('z1') // rue de Vesle
      expect(zone(49.2672, 4.029, 'Reims')).toBe('z2') // avenue de Laon
      expect(zone(49.2395, 4.007, 'Reims')).toBe('z3') // Croix-Rouge
      expect(zone(49.22, 4.05, 'Cormontreuil')).toBe('z3')
      expect(zone(49.24, 4.08, 'Reims')).toBe('z3') // Reims au-delà de 2 km
      expect(zone(49.279, 4.054, 'Bétheny')).toBe('z4')
      expect(zone(49.255, 3.96, 'Thillois')).toBe('z4')
      expect(zone(49.04, 3.96, 'Épernay')).toBe('z4')

      const prices = await db.query<{ code: string; base_price_cents: number; late_penalty_pct: number }>(
        `select code, base_price_cents, late_penalty_pct from public.pricing_zones order by position`,
      )
      expect(prices.map((p) => [p.code, p.base_price_cents, p.late_penalty_pct])).toEqual([
        ['z1', 700, 0],
        ['z2', 1000, 10],
        ['z3', 1400, 20],
        ['z4', 1900, 35],
      ])
    })
  })

  it('un profil est créé à l’inscription, sans lire le rôle dans les métadonnées', async () => {
    await tx(async (db) => {
      await db.query(`
        insert into auth.users (id, email, raw_user_meta_data)
        values ('00000000-0000-4000-a000-0000000000ff', 'nouveau@exemple.test', '{"full_name":"Nouveau","role":"admin"}')`)
      const p = await db.one<{ role: string; full_name: string; email: string }>(
        `select role, full_name, email from public.profiles where id = '00000000-0000-4000-a000-0000000000ff'`,
      )
      expect(p).toEqual({ role: 'user', full_name: 'Nouveau', email: 'nouveau@exemple.test' })
    })
  })

  it('références CMF-AAAA-NNNN', async () => {
    await tx(async (db) => {
      const rows = await db.query<{ reference: string }>(`select reference from public.visit_requests`)
      for (const r of rows) expect(r.reference).toMatch(/^CMF-\d{4}-\d{4}$/)
    })
  })
})
