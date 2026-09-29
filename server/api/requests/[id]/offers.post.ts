import { offerSchema } from '#shared/schemas/request'

/** Nouvelle proposition de prix (client ou admin). */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { db } = await requireUser(event)
  const input = await readValid(event, offerSchema)
  const { data: offer, error } = await db.rpc('create_offer', {
    p_request_id: id,
    p_amount_cents: input.amountCents,
    p_note: input.note ?? undefined,
  })
  if (error) dbError(error)
  if (offer && offer.author_side !== 'system') {
    await notify(event, {
      type: 'offer_received',
      requestId: id,
      amountCents: offer.amount_cents,
      fromSide: offer.author_side,
    })
  }
  return offer
})
