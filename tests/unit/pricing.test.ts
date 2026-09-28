import { describe, expect, it } from 'vitest'
import {
  cancellationOutcome,
  distanceKm,
  formatEuros,
  isPaymentOpen,
  normalizeCommune,
  paymentOpensAt,
  pointInPolygon,
  resolveZone,
  urgentFeeCents,
  type ZoneRuleEntry,
} from '#shared/domain/pricing'

const H = 3600_000
const at = (iso: string) => new Date(iso)

describe('supplément 48 h', () => {
  const published = at('2026-10-01T10:00:00Z')
  it('appliqué sous 48 h', () => {
    expect(urgentFeeCents(new Date(published.getTime() + 47 * H), published)).toBe(500)
    expect(urgentFeeCents(new Date(published.getTime() + 48 * H - 1), published)).toBe(500)
  })
  it('pas appliqué à 48 h ou plus', () => {
    expect(urgentFeeCents(new Date(published.getTime() + 48 * H), published)).toBe(0)
    expect(urgentFeeCents(new Date(published.getTime() + 200 * H), published)).toBe(0)
  })
})

describe('fenêtre de paiement', () => {
  const slot = at('2026-10-20T09:00:00Z')
  it('ouvre 7 jours avant le créneau', () => {
    expect(paymentOpensAt(slot).toISOString()).toBe('2026-10-13T09:00:00.000Z')
    expect(isPaymentOpen(slot, at('2026-10-13T08:59:59Z'))).toBe(false)
    expect(isPaymentOpen(slot, at('2026-10-13T09:00:00Z'))).toBe(true)
  })
  it('ferme au créneau', () => {
    expect(isPaymentOpen(slot, at('2026-10-20T09:00:00Z'))).toBe(false)
  })
})

describe('annulation et pénalités', () => {
  const slot = at('2026-10-20T09:00:00Z')
  const base = { paidCents: 1900, slotAt: slot, latePenaltyPct: 35 }

  it('client à plus de 24 h : remboursement intégral', () => {
    expect(cancellationOutcome({ ...base, cancelledBy: 'owner', now: at('2026-10-19T08:59:00Z') })).toEqual({
      penaltyCents: 0,
      refundCents: 1900,
      late: false,
    })
  })

  it('client à moins de 24 h : pénalité de zone', () => {
    expect(cancellationOutcome({ ...base, cancelledBy: 'owner', now: at('2026-10-19T09:00:01Z') })).toEqual({
      penaltyCents: 665,
      refundCents: 1235,
      late: true,
    })
  })

  it('zone sans pénalité', () => {
    const r = cancellationOutcome({
      ...base,
      latePenaltyPct: 0,
      cancelledBy: 'owner',
      now: at('2026-10-20T08:00:00Z'),
    })
    expect(r.refundCents).toBe(1900)
  })

  it('admin, agent ou système : toujours intégral', () => {
    for (const by of ['admin', 'assigned_agent', 'system'] as const) {
      expect(
        cancellationOutcome({ ...base, cancelledBy: by, now: at('2026-10-20T08:00:00Z') }).refundCents,
      ).toBe(1900)
    }
  })

  it('arrondi au centime', () => {
    const r = cancellationOutcome({
      paidCents: 1500,
      slotAt: slot,
      latePenaltyPct: 10,
      cancelledBy: 'owner',
      now: slot,
    })
    expect(r).toMatchObject({ penaltyCents: 150, refundCents: 1350 })
  })
})

describe('zones', () => {
  const centre = { lat: 49.2566, lng: 4.0327 }
  const rules: ZoneRuleEntry[] = [
    {
      zoneId: 'z1',
      priority: 10,
      rule: { kind: 'radius', center: centre, radiusKm: 1, communes: ['Reims'] },
    },
    {
      zoneId: 'z2',
      priority: 20,
      rule: { kind: 'radius', center: centre, radiusKm: 2, communes: ['Reims'] },
    },
    {
      zoneId: 'z3',
      priority: 30,
      rule: {
        kind: 'polygon',
        polygon: [
          { lat: 49.23, lng: 3.99 },
          { lat: 49.23, lng: 4.02 },
          { lat: 49.246, lng: 4.02 },
          { lat: 49.246, lng: 3.99 },
        ],
      },
    },
    { zoneId: 'z3', priority: 40, rule: { kind: 'commune', communes: ['Cormontreuil', 'Reims'] } },
    { zoneId: 'z4', priority: 100, rule: { kind: 'default' } },
  ]

  it('distance', () => {
    expect(distanceKm(centre, centre)).toBe(0)
    expect(distanceKm({ lat: 49.2566, lng: 4.0327 }, { lat: 49.2656, lng: 4.0327 })).toBeCloseTo(1.0, 1)
  })

  it('point dans polygone', () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
    ]
    expect(pointInPolygon({ lat: 0.5, lng: 0.5 }, square)).toBe(true)
    expect(pointInPolygon({ lat: 1.5, lng: 0.5 }, square)).toBe(false)
  })

  it('normalisation des communes', () => {
    expect(normalizeCommune('Bétheny')).toBe('betheny')
    expect(normalizeCommune('Saint-Brice-Courcelles')).toBe('saint brice courcelles')
  })

  it('centre-ville → zone 1', () => {
    expect(resolveZone({ point: { lat: 49.2575, lng: 4.034 }, commune: 'Reims' }, rules)).toBe('z1')
  })
  it('1,5 km du centre → zone 2', () => {
    expect(resolveZone({ point: { lat: 49.27, lng: 4.0327 }, commune: 'Reims' }, rules)).toBe('z2')
  })
  it('Croix-Rouge → zone 3', () => {
    expect(resolveZone({ point: { lat: 49.238, lng: 4.005 }, commune: 'Reims' }, rules)).toBe('z3')
  })
  it('Cormontreuil → zone 3', () => {
    expect(resolveZone({ point: { lat: 49.22, lng: 4.05 }, commune: 'Cormontreuil' }, rules)).toBe('z3')
  })
  it('rayon limité à la commune : Tinqueux proche du centre → pas zone 1/2', () => {
    expect(resolveZone({ point: { lat: 49.2566, lng: 4.03 }, commune: 'Tinqueux' }, rules)).toBe('z4')
  })
  it('hors Reims → zone 4', () => {
    expect(resolveZone({ point: { lat: 48.85, lng: 2.35 }, commune: 'Paris' }, rules)).toBe('z4')
  })
  it('adresse inconnue → à fixer par un admin', () => {
    expect(resolveZone({ point: null, commune: null }, rules)).toBeNull()
  })
})

describe('format des montants', () => {
  it('euros français', () => {
    expect(formatEuros(1600)).toMatch(/^16,00\s€$/)
    expect(formatEuros(1600, true)).toMatch(/^16\s€$/)
    expect(formatEuros(1650, true)).toMatch(/^16,50\s€$/)
  })
})
