import { z } from 'zod'

const schema = z.object({ amountCents: z.number().int().positive() })

/** Remboursement manuel (litige, geste commercial). */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  await requireAdmin(event)
  const { amountCents } = await readValid(event, schema)
  const refunded = await refundPayment(event, id, amountCents)
  return { refundedCents: refunded }
})
