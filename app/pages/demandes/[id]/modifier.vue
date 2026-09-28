<script setup lang="ts">
import { isEditable, type RequestStatus } from '#shared/domain/stateMachine'
import { formToDraft, rowToForm, emptyRequestForm, type RequestForm } from '~/utils/requestForm'

definePageMeta({ layout: 'app', roles: ['user'] })

const route = useRoute()
const id = String(route.params.id)
const supabase = useSupabaseClient()

const { data: request } = await useAsyncData(`request-edit-${id}`, async () => {
  const { data } = await supabase.from('visit_requests').select('*').eq('id', id).maybeSingle()
  return data
})
if (!request.value) throw createError({ statusCode: 404, statusMessage: 'Demande introuvable', fatal: true })
if (!isEditable(request.value.status as RequestStatus)) await navigateTo(`/demandes/${id}`, { replace: true })

useSeoMeta({ title: `Modifier ${request.value.reference}` })

const form = reactive<RequestForm>(request.value ? rowToForm(request.value) : emptyRequestForm())
const isDraft = computed(() => request.value?.status === 'brouillon')
const pending = ref(false)
const serverError = ref<string | null>(null)
const saved = ref(false)

async function save() {
  pending.value = true
  serverError.value = null
  saved.value = false
  try {
    await api(`/api/requests/${id}`, { method: 'PATCH', body: { draft: formToDraft(form) } })
    if (isDraft.value) saved.value = true
    else await navigateTo(`/demandes/${id}`)
  } catch (error) {
    serverError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}

async function publish() {
  pending.value = true
  serverError.value = null
  try {
    await api(`/api/requests/${id}/publish`, {
      method: 'POST',
      body: { ...formToDraft(form), consent: form.consent },
    })
    await navigateTo(`/demandes/${id}`)
  } catch (error) {
    serverError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div v-if="request">
    <UiPageHeader
      :title="isDraft ? 'Brouillon de demande' : 'Modifier la demande'"
      :subtitle="`${request.reference} · vous pouvez modifier la demande tant que le prix n’est pas accepté.`"
    />
    <UiAlertBox v-if="route.query.rattache" tone="success" class="mb-5">
      Votre demande a été rattachée à votre compte. Vérifiez-la, cochez l’attestation, puis publiez.
    </UiAlertBox>
    <UiAlertBox v-if="saved" tone="success" class="mb-5">Brouillon enregistré.</UiAlertBox>
    <RequestRequestForm
      v-model="form"
      :mode="isDraft ? 'draft' : 'edit'"
      :pending="pending"
      :server-error="serverError"
      @publish="publish"
      @save="save"
    />
  </div>
</template>
