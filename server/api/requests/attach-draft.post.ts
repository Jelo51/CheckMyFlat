import { z } from 'zod'
import { draftToColumns, requestDraftSchema } from '#shared/schemas/request'
import type { TablesInsert } from '~~/app/types/database.types'

const bodySchema = z.object({ draft: requestDraftSchema.nullish() })

/**
 * Rattache au compte le brouillon rempli avant l'inscription : celui du
 * navigateur s'il est fourni, sinon celui enregistré dans les métadonnées
 * du compte à l'inscription (cas d'une confirmation d'email sur un autre
 * appareil). Crée une demande `brouillon` et renvoie son identifiant.
 */
export default defineEventHandler(async (event) => {
  const { userId, db } = await requireUser(event)
  const { draft: bodyDraft } = await readValid(event, bodySchema)
  const admin = serviceClient(event)

  const { data: authUser } = await admin.auth.admin.getUserById(userId)
  const metadataDraft = requestDraftSchema.safeParse(authUser.user?.user_metadata?.pending_draft)
  const draft = bodyDraft ?? (metadataDraft.success ? metadataDraft.data : null)

  if (authUser.user?.user_metadata?.pending_draft != null) {
    await admin.auth.admin.updateUserById(userId, { user_metadata: { pending_draft: null } })
  }
  if (!draft || Object.keys(draft).length === 0) return { id: null }

  const inserted = await db
    .from('visit_requests')
    .insert(draftToColumns(draft) as TablesInsert<'visit_requests'>)
    .select('id')
    .single()
  return { id: must(inserted).id }
})
