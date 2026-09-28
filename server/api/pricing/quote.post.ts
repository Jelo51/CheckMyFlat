import { z } from 'zod'
import { urgentFeeCents } from '#shared/domain/pricing'

const schema = z.object({
  address: z.string().trim().max(200).default(''),
  postalCode: z.string().trim().max(10).default(''),
  city: z.string().trim().max(120).default(''),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  slotAt: z.iso.datetime({ offset: true }).nullish(),
})

/** Estimation affichée pendant la saisie : zone, prix plancher et supplément 48 h. */
export default defineEventHandler(async (event) => {
  const input = await readValid(event, schema)
  const place = await placeOf(input)
  const zone = await findZone(event, place)
  return {
    zone: zone
      ? {
          id: zone.id,
          label: zone.label,
          basePriceCents: zone.base_price_cents,
          latePenaltyPct: zone.late_penalty_pct,
        }
      : null,
    urgentFeeCents: input.slotAt ? urgentFeeCents(new Date(input.slotAt), new Date()) : 0,
  }
})
