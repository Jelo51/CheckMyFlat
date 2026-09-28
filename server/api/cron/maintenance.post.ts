import { timingSafeEqual } from 'node:crypto'

/**
 * Déclenchement externe de la maintenance (cron système, hébergement sans
 * tâches planifiées). Protégé par `Authorization: Bearer NUXT_CRON_SECRET`.
 */
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig(event).cronSecret
  const given = (getHeader(event, 'authorization') ?? '').replace(/^Bearer\s+/i, '')
  const ok =
    !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  if (!ok) throw createError({ statusCode: 401, statusMessage: 'Non autorisé' })
  return runPaymentsMaintenance()
})
