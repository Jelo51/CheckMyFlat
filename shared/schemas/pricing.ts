import { z } from 'zod'

const geoPoint = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
const communes = z.array(z.string().trim().min(1).max(120)).max(100)

export const zoneRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('radius'),
    center: geoPoint,
    radiusKm: z.number().positive().max(200),
    communes: communes.optional(),
  }),
  z.object({ kind: z.literal('polygon'), polygon: z.array(geoPoint).min(3).max(500) }),
  z.object({ kind: z.literal('commune'), communes: communes.min(1) }),
  z.object({ kind: z.literal('default') }),
])

export const pricingZoneSchema = z.object({
  label: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200).nullish(),
  basePriceCents: z.number().int().min(100).max(100_000),
  latePenaltyPct: z.number().int().min(0).max(100),
  active: z.boolean(),
})

export const zoneRuleEntrySchema = z.object({
  priority: z.number().int().min(0).max(1000),
  rule: zoneRuleSchema,
})

export const pricingZoneUpdateSchema = pricingZoneSchema.extend({
  rules: z.array(zoneRuleEntrySchema).max(50),
})

export type PricingZoneUpdate = z.infer<typeof pricingZoneUpdateSchema>
