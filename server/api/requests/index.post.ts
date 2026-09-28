import { z } from 'zod'
import { draftToColumns, requestDraftSchema } from '#shared/schemas/request'
import type { TablesInsert } from '~~/app/types/database.types'

const schema = z.object({ draft: requestDraftSchema })

/** Crée une demande en brouillon. */
export default defineEventHandler(async (event) => {
  const { db, profile } = await requireUser(event)
  if (profile.role !== 'user') {
    throw createError({ statusCode: 403, statusMessage: 'Réservé aux clients' })
  }
  const { draft } = await readValid(event, schema)
  const inserted = await db
    .from('visit_requests')
    .insert(draftToColumns(draft) as TablesInsert<'visit_requests'>)
    .select('id')
    .single()
  return { id: must(inserted).id }
})
