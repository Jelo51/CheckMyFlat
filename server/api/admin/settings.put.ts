import { z } from 'zod'

const schema = z.object({
  maxMediaMb: z.number().int().min(10).max(5000),
  maxVideoSeconds: z.number().int().min(10).max(900),
})

/** Paramètres des médias par visite. */
export default defineEventHandler(async (event) => {
  const { db } = await requireAdmin(event)
  const input = await readValid(event, schema)
  const updates = [
    { key: 'max_media_bytes_per_visit', value: input.maxMediaMb * 1024 * 1024 },
    { key: 'max_video_seconds', value: input.maxVideoSeconds },
  ]
  for (const u of updates) {
    const { error } = await db.from('app_settings').update({ value: u.value }).eq('key', u.key)
    if (error) dbError(error)
  }
  return { ok: true }
})
