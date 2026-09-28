<script setup lang="ts">
import { Download, FileText, FolderLock } from 'lucide-vue-next'
import { formatDay } from '#shared/utils/time'
import { PROPERTY_TYPE_LABELS, type PropertyType } from '#shared/schemas/request'

definePageMeta({ layout: 'app', roles: ['user'] })
useSeoMeta({ title: 'Mes rapports' })

const supabase = useSupabaseClient()
const { data: reports, refresh } = await useAsyncData('my-reports', async () => {
  const { data } = await supabase
    .from('visit_requests')
    .select(
      'id, reference, status, address, city, property_type, visit_reports(global_score, delivered_at, pdf_size_bytes, filming_refused, report_media(kind))',
    )
    .in('status', ['rapport_livre', 'litige'])
    .order('slot_at', { ascending: false })
  return (data ?? []).filter((r) => r.visit_reports)
})

const { download, pending, error } = usePdfDownload()

function counts(media: { kind: string }[]) {
  const photos = media.filter((m) => m.kind === 'photo').length
  const videos = media.length - photos
  return [
    photos && `${photos} photo${photos > 1 ? 's' : ''}`,
    videos && `${videos} vidéo${videos > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(', ')
}

const deleteDialog = ref<{ open: () => void; close: () => void } | null>(null)
const toDelete = ref<string | null>(null)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

function askDelete(id: string) {
  toDelete.value = id
  deleteError.value = null
  deleteDialog.value?.open()
}
async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await api(`/api/requests/${toDelete.value}`, { method: 'DELETE' })
    deleteDialog.value?.close()
    await refresh()
  } catch (e) {
    deleteError.value = errorMessage(e)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Mes rapports"
      subtitle="Vos rapports restent disponibles tant que votre compte est actif."
    />
    <UiAlertBox v-if="error" tone="error" class="mb-4">{{ error }}</UiAlertBox>

    <UiEmptyState
      v-if="!reports?.length"
      :icon="FileText"
      title="Aucun rapport pour l’instant"
      text="Vos rapports de visite apparaîtront ici sous 24 h après chaque visite."
    />

    <ul v-else class="grid gap-3.5 md:grid-cols-3">
      <li v-for="r in reports" :key="r.id" class="panel flex flex-col gap-2.5 p-[18px]">
        <span class="grid h-9 w-9 place-items-center rounded-[9px] bg-[#F1F3EF] text-muted">
          <UiIcon :icon="FileText" />
        </span>
        <div>
          <h2 class="text-[15px] font-semibold">
            {{ r.property_type ? PROPERTY_TYPE_LABELS[r.property_type as PropertyType] : 'Logement' }} ·
            {{ r.address }}, {{ r.city }}
          </h2>
          <p class="mt-1 text-[12.5px] text-muted">
            <span class="font-mono">{{ r.reference }}</span>
            <template v-if="r.visit_reports?.delivered_at">
              · {{ formatDay(r.visit_reports.delivered_at) }}
            </template>
            <template v-if="r.visit_reports?.pdf_size_bytes">
              · {{ (r.visit_reports.pdf_size_bytes / 1024 / 1024).toFixed(1).replace('.', ',') }} Mo
            </template>
          </p>
          <p class="mt-0.5 text-[12.5px] text-muted">
            {{
              r.visit_reports?.filming_refused
                ? 'Prise de vue refusée'
                : counts(r.visit_reports?.report_media ?? [])
            }}
          </p>
        </div>
        <div class="mt-auto flex gap-2 pt-2">
          <NuxtLink :to="`/rapports/${r.id}`" class="btn btn-ghost btn-sm">Ouvrir</NuxtLink>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            :disabled="pending === r.id"
            @click="download(r.id)"
          >
            <UiIcon :icon="Download" :size="16" />
            PDF
          </button>
        </div>
      </li>
    </ul>

    <div v-if="reports?.length" class="card mt-7 flex flex-wrap items-center gap-3.5 p-[18px]">
      <UiIcon :icon="FolderLock" :size="24" class="text-muted" />
      <p class="min-w-[220px] flex-1 text-sm">
        Vous pouvez supprimer définitivement un rapport et ses médias. La suppression est immédiate et
        irréversible.
      </p>
      <label for="delete-report" class="sr-only">Rapport à supprimer</label>
      <select id="delete-report" v-model="toDelete" class="input max-w-[260px]">
        <option :value="null" disabled>Choisir un rapport</option>
        <option v-for="r in reports" :key="r.id" :value="r.id">{{ r.reference }} · {{ r.city }}</option>
      </select>
      <button type="button" class="btn btn-danger btn-sm" :disabled="!toDelete" @click="askDelete(toDelete!)">
        Supprimer
      </button>
    </div>

    <UiReasonDialog
      ref="deleteDialog"
      title="Supprimer ce rapport ?"
      confirm-label="Supprimer définitivement"
      tone="danger"
      :pending="deleting"
      :error="deleteError"
      @confirm="confirmDelete"
    >
      <p>
        Le rapport, les photos et les vidéos seront supprimés. La trace du paiement est conservée pour nos
        obligations comptables.
      </p>
    </UiReasonDialog>
  </div>
</template>
