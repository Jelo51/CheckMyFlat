import { z } from 'zod'

export const PROPERTY_TYPES = ['studio', 't1', 't2', 't3', 't4', 't5_plus', 'maison', 'autre'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  studio: 'Studio',
  t1: 'T1',
  t2: 'T2',
  t3: 'T3',
  t4: 'T4',
  t5_plus: 'T5 et plus',
  maison: 'Maison',
  autre: 'Autre',
}

export const MIN_PRICE_CENTS = 100
export const MAX_PRICE_CENTS = 100_000

const trimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `${max} caractères maximum` })

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) => {
      try {
        const url = new URL(value)
        return url.protocol === 'https:' || url.protocol === 'http:'
      } catch {
        return false
      }
    },
    { error: 'Lien invalide (il doit commencer par https://)' },
  )

const phone = z
  .string()
  .trim()
  .regex(/^[+0-9 ().-]{6,20}$/, { error: 'Numéro de téléphone invalide' })

const priceCents = z
  .number({ error: 'Indiquez un prix' })
  .int()
  .min(MIN_PRICE_CENTS, { error: 'Prix minimum : 1 €' })
  .max(MAX_PRICE_CENTS, { error: 'Prix maximum : 1 000 €' })

/** Champs d'une demande. Tous facultatifs en brouillon. */
export const requestFieldsSchema = z.object({
  listingUrl: httpUrl.nullish(),
  address: trimmed(200).min(3, { error: "Indiquez l'adresse" }),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, { error: 'Code postal à 5 chiffres' }),
  city: trimmed(120).min(1, { error: 'Indiquez la ville' }),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  propertyType: z.enum(PROPERTY_TYPES, { error: 'Choisissez le type de bien' }),
  slotAt: z.iso.datetime({ offset: true, error: 'Indiquez la date et l’heure du rendez-vous' }),
  agencyName: trimmed(160).min(2, { error: 'Indiquez le contact sur place' }),
  agencyPhone: phone,
  agencyEmail: z.email({ error: 'Email invalide' }).nullish(),
  priorities: trimmed(2000).nullish(),
  proposedPriceCents: priceCents,
})

export type RequestFields = z.infer<typeof requestFieldsSchema>

/** Brouillon : n'importe quel sous-ensemble des champs. */
export const requestDraftSchema = requestFieldsSchema.partial()
export type RequestDraft = z.infer<typeof requestDraftSchema>

/** Publication : tous les champs + attestation + créneau dans le futur. */
export function requestPublishSchema(now: () => Date = () => new Date()) {
  return requestFieldsSchema
    .extend({
      consent: z.literal(true, { error: 'Vous devez confirmer avoir prévenu l’agence' }),
    })
    .refine((data) => new Date(data.slotAt) > now(), {
      error: 'Le rendez-vous doit être dans le futur',
      path: ['slotAt'],
    })
}

export type RequestPublish = z.infer<ReturnType<typeof requestPublishSchema>>

export const offerSchema = z.object({
  amountCents: priceCents,
  note: trimmed(300).nullish(),
})
export type OfferInput = z.infer<typeof offerSchema>

export const messageSchema = z.object({
  body: trimmed(2000).min(1, { error: 'Message vide' }),
})
export type MessageInput = z.infer<typeof messageSchema>

export const cancelSchema = z.object({
  reason: trimmed(500).min(3, { error: 'Indiquez un motif' }),
})

export const disputeSchema = cancelSchema

/** Champs de l'API → colonnes de `visit_requests`. */
export function draftToColumns(draft: RequestDraft): Record<string, unknown> {
  const map = {
    listingUrl: 'listing_url',
    address: 'address',
    postalCode: 'postal_code',
    city: 'city',
    lat: 'lat',
    lng: 'lng',
    propertyType: 'property_type',
    slotAt: 'slot_at',
    agencyName: 'agency_name',
    agencyPhone: 'agency_phone',
    agencyEmail: 'agency_email',
    priorities: 'priorities',
    proposedPriceCents: 'proposed_price_cents',
  } as const
  return Object.fromEntries(
    Object.entries(draft)
      .filter(([k]) => k in map)
      .map(([k, v]) => [map[k as keyof typeof map], v]),
  )
}
