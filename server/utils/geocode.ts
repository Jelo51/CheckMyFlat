/**
 * Géocodage via l'API Géoplateforme de l'IGN (gratuite, sans clé).
 * https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage
 * En cas d'indisponibilité, on renvoie une liste vide : la zone sera fixée
 * par un admin.
 */

const ENDPOINT = 'https://data.geopf.fr/geocodage/search'

export interface GeocodedAddress {
  label: string
  address: string
  postalCode: string
  city: string
  lat: number
  lng: number
}

interface Feature {
  geometry?: { coordinates?: [number, number] }
  properties?: { label?: string; name?: string; postcode?: string; city?: string }
}

export async function geocode(query: string, options: { autocomplete?: boolean; limit?: number } = {}) {
  const q = query.trim()
  if (q.length < 3) return []
  try {
    const res = await $fetch<{ features?: Feature[] }>(ENDPOINT, {
      query: { q, limit: options.limit ?? 5, index: 'address', autocomplete: options.autocomplete ? 1 : 0 },
      timeout: 4000,
      retry: 0,
    })
    return (res.features ?? []).flatMap((f): GeocodedAddress[] => {
      const [lng, lat] = f.geometry?.coordinates ?? []
      const p = f.properties ?? {}
      if (typeof lat !== 'number' || typeof lng !== 'number' || !p.city || !p.postcode) return []
      return [
        {
          label: p.label ?? `${p.name}, ${p.postcode} ${p.city}`,
          address: p.name ?? '',
          postalCode: p.postcode,
          city: p.city,
          lat,
          lng,
        },
      ]
    })
  } catch (error) {
    console.warn('[geocode] indisponible', (error as Error).message)
    return []
  }
}
