import { z } from 'zod'

const schema = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|webm)$/),
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
  durationSeconds: z.number().positive().nullish(),
})

/**
 * Confirme un fichier envoyé : vérifie qu'il existe dans le dossier de la
 * visite, relit sa taille et son type réels, contrôle à nouveau le quota,
 * puis l'enregistre.
 */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const visit = await requireAssignedVisit(event, id)
  const input = await readValid(event, schema)
  if (!input.path.startsWith(`${id}/`))
    throw createError({ statusCode: 422, statusMessage: 'Chemin invalide' })
  const report = await ensureReport(visit)
  const admin = serviceClient(event)

  const fileName = input.path.split('/')[1]!
  const { data: listing } = await admin.storage.from('report-media').list(id, { search: fileName, limit: 1 })
  const object = listing?.find((o) => o.name === fileName)
  const size = Number(object?.metadata?.size ?? 0)
  const mime = String(object?.metadata?.mimetype ?? '')
  if (!object || size <= 0 || !/^(image|video)\//.test(mime)) {
    throw createError({ statusCode: 422, statusMessage: 'Fichier introuvable ou invalide' })
  }

  try {
    await assertQuota(visit.ctx.db, report.id, size)
  } catch (error) {
    await admin.storage.from('report-media').remove([input.path])
    throw error
  }

  const { count } = await admin
    .from('report_media')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', report.id)
  const inserted = await admin
    .from('report_media')
    .insert({
      report_id: report.id,
      kind: mime.startsWith('video/') ? 'video' : 'photo',
      storage_path: input.path,
      mime,
      size_bytes: size,
      width: input.width ?? null,
      height: input.height ?? null,
      duration_seconds: input.durationSeconds ?? null,
      position: (count ?? 0) + 1,
    })
    .select('*')
    .single()
  return must(inserted)
})
