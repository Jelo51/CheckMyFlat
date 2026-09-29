import { z } from 'zod'
import { isPaymentOpen } from '#shared/domain/pricing'

const schema = z.object({ accept: z.boolean() })

/** Accepte ou refuse la proposition de l'autre partie. */
export default defineEventHandler(async (event) => {
  const offerId = routeId(event)
  const { db } = await requireUser(event)
  const { accept } = await readValid(event, schema)
  const { data: request, error } = await db.rpc('respond_offer', { p_offer_id: offerId, p_accept: accept })
  if (error) dbError(error)
  if (accept && request) {
    // Si le paiement est déjà ouvert, l'email d'acceptation invite à payer :
    // inutile d'envoyer ensuite « paiement ouvert ».
    if (request.slot_at && isPaymentOpen(new Date(request.slot_at), new Date())) {
      await serviceClient(event)
        .from('visit_requests')
        .update({ payment_open_notified_at: new Date().toISOString() })
        .eq('id', request.id)
    }
    await notify(event, { type: 'offer_accepted', requestId: request.id })
  }
  return { status: request?.status }
})
