import type { Tables } from '~/types/database.types'
import type { PropertyType, RequestDraft } from '#shared/schemas/request'
import { dateToParisLocal, parisLocalToDate } from '#shared/utils/time'

/** État du formulaire de demande tel qu'édité à l'écran (prix en euros, date et heure séparées). */
export interface RequestForm {
  listingUrl: string
  address: string
  postalCode: string
  city: string
  lat: number | null
  lng: number | null
  propertyType: PropertyType | ''
  slotDate: string
  slotTime: string
  agencyName: string
  agencyPhone: string
  agencyEmail: string
  priorities: string
  proposedPrice: string
  consent: boolean
}

export function emptyRequestForm(): RequestForm {
  return {
    listingUrl: '',
    address: '',
    postalCode: '',
    city: '',
    lat: null,
    lng: null,
    propertyType: '',
    slotDate: '',
    slotTime: '',
    agencyName: '',
    agencyPhone: '',
    agencyEmail: '',
    priorities: '',
    proposedPrice: '',
    consent: false,
  }
}

const blankToNull = (value: string) => (value.trim() === '' ? null : value.trim())

export function eurosToCents(value: string): number | null {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  if (normalized === '') return null
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN
}

/** Formulaire → champs de la demande (API). Les champs vides sont omis. */
export function formToDraft(form: RequestForm): RequestDraft {
  const draft: Record<string, unknown> = {
    listingUrl: blankToNull(form.listingUrl),
    address: blankToNull(form.address),
    postalCode: blankToNull(form.postalCode),
    city: blankToNull(form.city),
    lat: form.lat,
    lng: form.lng,
    propertyType: form.propertyType || null,
    slotAt:
      form.slotDate && form.slotTime ? parisLocalToDate(form.slotDate, form.slotTime).toISOString() : null,
    agencyName: blankToNull(form.agencyName),
    agencyPhone: blankToNull(form.agencyPhone),
    agencyEmail: blankToNull(form.agencyEmail),
    priorities: blankToNull(form.priorities),
    proposedPriceCents: eurosToCents(form.proposedPrice),
  }
  // Brouillon : on n'envoie que ce qui est renseigné.
  return Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== null)) as RequestDraft
}

type RequestRow = Tables<'visit_requests'>

export function rowToForm(row: RequestRow): RequestForm {
  const slot = row.slot_at ? dateToParisLocal(new Date(row.slot_at)) : { date: '', time: '' }
  return {
    listingUrl: row.listing_url ?? '',
    address: row.address ?? '',
    postalCode: row.postal_code ?? '',
    city: row.city ?? '',
    lat: row.lat,
    lng: row.lng,
    propertyType: (row.property_type ?? '') as PropertyType | '',
    slotDate: slot.date,
    slotTime: slot.time,
    agencyName: row.agency_name ?? '',
    agencyPhone: row.agency_phone ?? '',
    agencyEmail: row.agency_email ?? '',
    priorities: row.priorities ?? '',
    proposedPrice: row.proposed_price_cents ? String(row.proposed_price_cents / 100).replace('.', ',') : '',
    consent: !!row.consent_at,
  }
}
