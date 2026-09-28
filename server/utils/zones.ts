import type { H3Event } from 'h3'
import { resolveZone, type Place, type ZoneRule } from '#shared/domain/pricing'
import type { Tables } from '~~/app/types/database.types'

export type PricingZone = Tables<'pricing_zones'>

/** Zone d'un lieu d'après les règles en base ; `null` si indéterminable. */
export async function findZone(event: H3Event, place: Place): Promise<PricingZone | null> {
  const db = serviceClient(event)
  const [{ data: zones }, { data: rules }] = await Promise.all([
    db.from('pricing_zones').select('*').eq('active', true),
    db.from('pricing_zone_rules').select('zone_id, priority, rule'),
  ])
  const active = new Map((zones ?? []).map((z) => [z.id, z]))
  const entries = (rules ?? [])
    .filter((r) => active.has(r.zone_id))
    .map((r) => ({ zoneId: r.zone_id, priority: r.priority, rule: r.rule as unknown as ZoneRule }))
  const zoneId = resolveZone(place, entries)
  return zoneId ? (active.get(zoneId) ?? null) : null
}

/**
 * Lieu d'une demande : coordonnées fournies par l'autocomplétion, sinon
 * géocodage de l'adresse saisie.
 */
export async function placeOf(input: {
  address: string
  postalCode: string
  city: string
  lat?: number | null
  lng?: number | null
}): Promise<Place & { lat: number | null; lng: number | null }> {
  if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    return { point: { lat: input.lat, lng: input.lng }, commune: input.city, lat: input.lat, lng: input.lng }
  }
  const [hit] = await geocode(`${input.address} ${input.postalCode} ${input.city}`, { limit: 1 })
  // Sans coordonnées, la commune seule ne suffit pas (zones au rayon) : un
  // admin fixera la zone.
  if (!hit) return { point: null, commune: null, lat: null, lng: null }
  return { point: { lat: hit.lat, lng: hit.lng }, commune: hit.city, lat: hit.lat, lng: hit.lng }
}
