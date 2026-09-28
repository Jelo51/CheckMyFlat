/**
 * Tarifs, zones, supplément d'urgence, fenêtre de paiement et pénalités.
 * Les valeurs (prix, règles de zone, pénalités) sont stockées en base ; ce
 * module ne contient que la logique.
 */

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

/** Supplément appliqué si le créneau est à moins de 48 h de la publication. */
export const URGENT_FEE_CENTS = 500
export const URGENT_WINDOW_MS = 48 * HOUR_MS
/** Le paiement ouvre au plus tôt 7 jours avant le créneau (durée de l'empreinte bancaire). */
export const PAYMENT_WINDOW_MS = 7 * DAY_MS
/** Annulation par le client moins de 24 h avant le créneau : pénalité de zone. */
export const LATE_CANCEL_WINDOW_MS = 24 * HOUR_MS
/** Validité d'une proposition de prix. */
export const OFFER_VALIDITY_MS = 48 * HOUR_MS

export function urgentFeeCents(slotAt: Date, publishedAt: Date): number {
  return slotAt.getTime() - publishedAt.getTime() < URGENT_WINDOW_MS ? URGENT_FEE_CENTS : 0
}

export function paymentOpensAt(slotAt: Date): Date {
  return new Date(slotAt.getTime() - PAYMENT_WINDOW_MS)
}

export function isPaymentOpen(slotAt: Date, now: Date): boolean {
  return now >= paymentOpensAt(slotAt) && now < slotAt
}

export function totalCents(agreedPriceCents: number, urgentFee: number): number {
  return agreedPriceCents + urgentFee
}

export type CancelledBy = 'owner' | 'admin' | 'assigned_agent' | 'system'

export interface CancellationInput {
  paidCents: number
  cancelledBy: CancelledBy
  slotAt: Date
  now: Date
  latePenaltyPct: number
}

export interface CancellationOutcome {
  penaltyCents: number
  refundCents: number
  late: boolean
}

/**
 * Seule une annulation du client à moins de 24 h du créneau entraîne une
 * pénalité. Visite non réalisée, annulation de l'agence ou de l'admin :
 * remboursement intégral.
 */
export function cancellationOutcome(input: CancellationInput): CancellationOutcome {
  const late =
    input.cancelledBy === 'owner' && input.slotAt.getTime() - input.now.getTime() < LATE_CANCEL_WINDOW_MS
  const pct = late ? Math.min(Math.max(input.latePenaltyPct, 0), 100) : 0
  const penaltyCents = Math.round((input.paidCents * pct) / 100)
  return { penaltyCents, refundCents: input.paidCents - penaltyCents, late }
}

const euroFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const euroRoundFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

/** « 16,00 € », ou « 16 € » si `compact` et montant rond. */
export function formatEuros(cents: number, compact = false): string {
  if (compact && cents % 100 === 0) return euroRoundFormatter.format(cents / 100)
  return euroFormatter.format(cents / 100)
}

/* ---------------------------------------------------------------- zones -- */

export interface GeoPoint {
  lat: number
  lng: number
}

export type ZoneRule =
  | { kind: 'radius'; center: GeoPoint; radiusKm: number; communes?: string[] }
  | { kind: 'polygon'; polygon: GeoPoint[] }
  | { kind: 'commune'; communes: string[] }
  | { kind: 'default' }

export interface ZoneRuleEntry {
  zoneId: string
  priority: number
  rule: ZoneRule
}

export interface Place {
  point: GeoPoint | null
  commune: string | null
}

/** « Bétheny » → « betheny » ; « Saint-Brice-Courcelles » → « saint brice courcelles ». */
export function normalizeCommune(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Test point-dans-polygone (lancer de rayon). */
export function pointInPolygon(p: GeoPoint, polygon: readonly GeoPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    const intersects =
      a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng
    if (intersects) inside = !inside
  }
  return inside
}

function ruleMatches(rule: ZoneRule, place: Place): boolean {
  const commune = place.commune ? normalizeCommune(place.commune) : null
  switch (rule.kind) {
    case 'radius':
      if (!place.point) return false
      if (rule.communes?.length && (!commune || !rule.communes.map(normalizeCommune).includes(commune)))
        return false
      return distanceKm(place.point, rule.center) <= rule.radiusKm
    case 'polygon':
      return !!place.point && pointInPolygon(place.point, rule.polygon)
    case 'commune':
      return !!commune && rule.communes.map(normalizeCommune).includes(commune)
    case 'default':
      return true
  }
}

/**
 * Première règle satisfaite par ordre de priorité croissante. `null` si
 * l'adresse n'a pas pu être géolocalisée et qu'aucune règle ne s'applique :
 * la zone est alors fixée par un admin.
 */
export function resolveZone(place: Place, rules: readonly ZoneRuleEntry[]): string | null {
  if (!place.point && !place.commune) return null
  const sorted = [...rules].sort((a, b) => a.priority - b.priority)
  return sorted.find((r) => ruleMatches(r.rule, place))?.zoneId ?? null
}
