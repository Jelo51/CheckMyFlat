<script setup lang="ts">
import { formToDraft, emptyRequestForm, type RequestForm } from '~/utils/requestForm'

/**
 * Nouvelle demande. Accessible sans compte : le brouillon est conservé dans
 * le navigateur et le compte n'est demandé qu'au moment de publier.
 */
useSeoMeta({ title: 'Nouvelle demande de visite' })

const user = useSupabaseUser()
const { role, ensure } = useProfile()
const localDraft = useLocalDraft()

setPageLayout(user.value ? 'app' : 'default')
if (user.value) await ensure()

const form = reactive<RequestForm>(emptyRequestForm())
const pending = ref(false)
const serverError = ref<string | null>(null)

onMounted(() => {
  const saved = localDraft.read()
  if (saved) Object.assign(form, saved)
  watch(form, (value) => localDraft.write(value), { deep: true })
})

const notClient = computed(() => !!user.value && role.value !== null && role.value !== 'user')

async function createDraft(): Promise<string> {
  const { id } = await api<{ id: string }>('/api/requests', {
    method: 'POST',
    body: { draft: formToDraft(form) },
  })
  return id
}

async function publish() {
  serverError.value = null
  if (!user.value) {
    // Le brouillon est déjà dans le navigateur : on demande le compte.
    localDraft.write(form)
    await navigateTo({ path: '/inscription', query: { next: '/demandes/nouvelle' } })
    return
  }
  pending.value = true
  try {
    const id = await createDraft()
    await api(`/api/requests/${id}/publish`, {
      method: 'POST',
      body: { ...formToDraft(form), consent: form.consent },
    })
    localDraft.clear()
    await navigateTo(`/demandes/${id}`)
  } catch (error) {
    serverError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}

async function save() {
  serverError.value = null
  if (!user.value) {
    localDraft.write(form)
    await navigateTo({ path: '/inscription', query: { next: '/demandes/nouvelle' } })
    return
  }
  pending.value = true
  try {
    const id = await createDraft()
    localDraft.clear()
    await navigateTo(`/demandes/${id}/modifier`)
  } catch (error) {
    serverError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div :class="{ 'wrap py-8 pb-16': !user }">
    <UiPageHeader
      title="Nouvelle demande de visite"
      :subtitle="
        user
          ? 'Décrivez le logement et le rendez-vous convenu avec l’agence.'
          : 'Vous pouvez remplir ce formulaire sans compte. La création se fait au moment de valider.'
      "
    />
    <UiAlertBox v-if="notClient" tone="warning">
      Les demandes de visite se déposent depuis un compte client.
    </UiAlertBox>
    <RequestRequestForm
      v-else
      v-model="form"
      mode="new"
      :pending="pending"
      :server-error="serverError"
      @publish="publish"
      @save="save"
    />
  </div>
</template>
