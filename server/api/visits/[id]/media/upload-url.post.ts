import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

const schema = z.object({
  mime: z.enum(Object.keys(MIME_EXT) as [string, ...string[]], { error: 'Format non pris en charge' }),
  sizeBytes: z.number().int().positive(),
  durationSeconds: z.number().positive().nullish(),
})

/**
 * URL d'upload signée vers le bucket privé, après contrôle du quota de la
 * visite et de la durée des vidéos. Le fichier est ensuite confirmé par
 * `POST /api/visits/:id/media`, qui vérifie la taille réelle.
 */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const visit = await requireAssignedVisit(event, id)
  const input = await readValid(event, schema)
  const report = await ensureReport(visit)
  const { db } = visit.ctx

  if (input.mime.startsWith('video/')) {
    const maxSeconds = await settingNumber(db, 'max_video_seconds', 120)
    if (!input.durationSeconds || input.durationSeconds > maxSeconds + 1) {
      throw createError({
        statusCode: 422,
        statusMessage: `Vidéo trop longue : ${maxSeconds / 60} min maximum`,
      })
    }
  }
  await assertQuota(db, report.id, input.sizeBytes)

  const path = `${id}/${randomUUID()}.${MIME_EXT[input.mime]}`
  const { data, error } = await serviceClient(event).storage.from('report-media').createSignedUploadUrl(path)
  if (error || !data) throw createError({ statusCode: 502, statusMessage: 'Stockage indisponible' })
  return { path: data.path, token: data.token }
})
