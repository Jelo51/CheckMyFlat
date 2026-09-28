import { messageSchema } from '#shared/schemas/request'
import type { TablesInsert } from '~~/app/types/database.types'

/** Message libre dans la messagerie de négociation. */
export default defineEventHandler(async (event) => {
  const id = routeId(event)
  const { db } = await requireUser(event)
  const { body } = await readValid(event, messageSchema)
  // `author_id` et `author_side` sont fixés par le trigger `messages_set_author`.
  const row = { request_id: id, body } as TablesInsert<'messages'>
  const inserted = await db.from('messages').insert(row).select('*').single()
  return must(inserted)
})
