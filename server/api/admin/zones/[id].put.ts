import { pricingZoneUpdateSchema } from '#shared/schemas/pricing'
import type { TablesInsert } from '~~/app/types/database.types'

/** Met à jour une zone et remplace ses règles de rattachement. */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { db } = await requireAdmin(event)
  const input = await readValid(event, pricingZoneUpdateSchema)

  const { error } = await db
    .from('pricing_zones')
    .update({
      label: input.label,
      description: input.description ?? null,
      base_price_cents: input.basePriceCents,
      late_penalty_pct: input.latePenaltyPct,
      active: input.active,
    })
    .eq('id', id)
  if (error) dbError(error)

  const { error: deleteError } = await db.from('pricing_zone_rules').delete().eq('zone_id', id)
  if (deleteError) dbError(deleteError)
  if (input.rules.length) {
    const { error: insertError } = await db.from('pricing_zone_rules').insert(
      input.rules.map((r): TablesInsert<'pricing_zone_rules'> => ({
        zone_id: id,
        priority: r.priority,
        rule: r.rule as unknown as TablesInsert<'pricing_zone_rules'>['rule'],
      })),
    )
    if (insertError) dbError(insertError)
  }
  return { id }
})
