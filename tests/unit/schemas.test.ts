import { describe, expect, it } from 'vitest'
import { offerSchema, requestDraftSchema, requestPublishSchema } from '#shared/schemas/request'
import { visitReportDraftSchema, visitReportSubmitSchema } from '#shared/schemas/visitReport'
import { signUpSchema } from '#shared/schemas/account'
import { pricingZoneUpdateSchema } from '#shared/schemas/pricing'
import type { ScoringBlock } from '#shared/domain/scoring'

const now = () => new Date('2026-10-01T10:00:00Z')

const validRequest = {
  listingUrl: 'https://www.leboncoin.fr/ad/locations/123',
  address: '12 rue de Vesle',
  postalCode: '51100',
  city: 'Reims',
  lat: 49.2537,
  lng: 4.0275,
  propertyType: 't2',
  slotAt: '2026-10-10T09:00:00.000Z',
  agencyName: 'Agence du Centre — Mme Martin',
  agencyPhone: '03 26 00 00 00',
  agencyEmail: null,
  priorities: 'Bruit de la rue, état de la salle de bains',
  proposedPriceCents: 1000,
  consent: true,
}

describe('demande', () => {
  const publish = requestPublishSchema(now)

  it('accepte une demande complète', () => {
    expect(publish.safeParse(validRequest).success).toBe(true)
  })

  it('exige l’attestation', () => {
    const r = publish.safeParse({ ...validRequest, consent: false })
    expect(r.success).toBe(false)
  })

  it('refuse un créneau passé', () => {
    const r = publish.safeParse({ ...validRequest, slotAt: '2026-09-30T09:00:00.000Z' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['slotAt'])
  })

  it('refuse un lien non http', () => {
    expect(publish.safeParse({ ...validRequest, listingUrl: 'javascript:alert(1)' }).success).toBe(false)
  })

  it('refuse un code postal invalide', () => {
    expect(publish.safeParse({ ...validRequest, postalCode: '5110' }).success).toBe(false)
  })

  it('brouillon : tout est facultatif, mais les champs remplis restent validés', () => {
    expect(requestDraftSchema.safeParse({}).success).toBe(true)
    expect(requestDraftSchema.safeParse({ city: 'Reims' }).success).toBe(true)
    expect(requestDraftSchema.safeParse({ proposedPriceCents: -5 }).success).toBe(false)
  })

  it('offre en centimes entiers entre 1 € et 1 000 €', () => {
    expect(offerSchema.safeParse({ amountCents: 1600 }).success).toBe(true)
    expect(offerSchema.safeParse({ amountCents: 16.5 }).success).toBe(false)
    expect(offerSchema.safeParse({ amountCents: 50 }).success).toBe(false)
  })
})

describe('compte rendu de visite', () => {
  const ids = Array.from(
    { length: 14 },
    (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  )
  const blocks: ScoringBlock[] = [
    { id: 'loc', weight: 0.25, criterionIds: ids.slice(0, 3) },
    { id: 'qual', weight: 0.3, criterionIds: ids.slice(3, 7) },
    { id: 'agen', weight: 0.25, criterionIds: ids.slice(7, 11) },
    { id: 'imm', weight: 0.2, criterionIds: ids.slice(11, 14) },
  ]
  const scores = Object.fromEntries(ids.map((id) => [id, { score: 4, comment: null }]))
  const base = {
    scores,
    globalScore: 4,
    justification: null,
    filmingRefused: false,
    negotiationPoints: ['Joint de douche à refaire'],
    reserves: [{ text: 'Rayure sur le parquet', mediaId: null }],
    conclusion: 'Logement conforme, bon rapport qualité-prix.',
    recommendation: 'deposer',
  }

  it('accepte un compte rendu complet', () => {
    expect(visitReportSubmitSchema({ blocks, mediaCount: 3 }).safeParse(base).success).toBe(true)
  })

  it('exige les 14 critères', () => {
    const partial = { ...base, scores: { ...scores, [ids[13]!]: { score: null } } }
    const r = visitReportSubmitSchema({ blocks, mediaCount: 3 }).safeParse(partial)
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['scores'])
  })

  it('exige une justification si l’écart dépasse 1 point', () => {
    const r = visitReportSubmitSchema({ blocks, mediaCount: 3 }).safeParse({ ...base, globalScore: 5 })
    // moyenne 4, note 5 : écart de 1, pas de justification requise
    expect(r.success).toBe(true)
    const low = visitReportSubmitSchema({ blocks, mediaCount: 3 }).safeParse({ ...base, globalScore: 2.9 })
    expect(low.success).toBe(false)
    expect(low.error?.issues.map((i) => i.path[0])).toContain('justification')
    const justified = visitReportSubmitSchema({ blocks, mediaCount: 3 }).safeParse({
      ...base,
      globalScore: 2.9,
      justification: 'Humidité importante non reflétée par les critères.',
    })
    expect(justified.success).toBe(true)
  })

  it('exige des médias sauf refus de prise de vue', () => {
    expect(visitReportSubmitSchema({ blocks, mediaCount: 0 }).safeParse(base).success).toBe(false)
    expect(
      visitReportSubmitSchema({ blocks, mediaCount: 0 }).safeParse({ ...base, filmingRefused: true }).success,
    ).toBe(true)
  })

  it('note globale : une décimale maximum', () => {
    expect(
      visitReportSubmitSchema({ blocks, mediaCount: 1 }).safeParse({ ...base, globalScore: 4.25 }).success,
    ).toBe(false)
    expect(
      visitReportSubmitSchema({ blocks, mediaCount: 1 }).safeParse({ ...base, globalScore: 4.2 }).success,
    ).toBe(true)
  })

  it('brouillon : accepte un état partiel', () => {
    expect(visitReportDraftSchema.safeParse({ scores: { [ids[0]!]: { score: 3 } } }).success).toBe(true)
  })
})

describe('compte', () => {
  it('inscription', () => {
    expect(
      signUpSchema.safeParse({
        fullName: 'Amélie R.',
        email: 'A@EXEMPLE.fr',
        password: 'motdepasse',
        acceptTerms: true,
      }).data?.email,
    ).toBe('a@exemple.fr')
    expect(
      signUpSchema.safeParse({ fullName: 'A', email: 'x', password: '123', acceptTerms: false }).success,
    ).toBe(false)
  })
})

describe('grille tarifaire', () => {
  it('valide les règles de zone', () => {
    expect(
      pricingZoneUpdateSchema.safeParse({
        label: 'Zone 1 — Centre-ville',
        basePriceCents: 700,
        latePenaltyPct: 0,
        active: true,
        rules: [{ priority: 10, rule: { kind: 'radius', center: { lat: 49.25, lng: 4.03 }, radiusKm: 1 } }],
      }).success,
    ).toBe(true)
    expect(
      pricingZoneUpdateSchema.safeParse({
        label: 'Zone',
        basePriceCents: 700,
        latePenaltyPct: 120,
        active: true,
        rules: [],
      }).success,
    ).toBe(false)
  })
})

describe('messages en français', () => {
  it('champs obligatoires absents', () => {
    const r = requestPublishSchema(now).safeParse({ consent: true })
    const messages = r.error?.issues.map((i) => i.message) ?? []
    expect(messages).toContain("Indiquez l'adresse")
    expect(messages).toContain('Indiquez le code postal')
    expect(messages).toContain('Indiquez le téléphone du contact')
    expect(messages.join(' ')).not.toMatch(/Invalid input|expected/)
  })
})
