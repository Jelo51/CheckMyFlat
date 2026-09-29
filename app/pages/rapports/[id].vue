<script setup lang="ts">
import { ArrowLeft, BadgeCheck, CameraOff, Download } from 'lucide-vue-next'
import { formatScore } from '#shared/domain/scoring'
import { RECOMMENDATION_LABELS, type Recommendation } from '#shared/schemas/visitReport'
import { formatDateTimeShort, formatSlot } from '#shared/utils/time'
import { PROPERTY_TYPE_LABELS, type PropertyType } from '#shared/schemas/request'
import type { ReportMedia } from '~/composables/useVisitReport'

definePageMeta({ layout: 'app', roles: ['user', 'agent', 'admin'] })

const route = useRoute()
const id = String(route.params.id)
const supabase = useSupabaseClient()
const { role } = useProfile()
const { blocks } = useCriteria()

const { data } = await useAsyncData(`report-${id}`, async () => {
  const [request, report] = await Promise.all([
    supabase.from('visit_requests').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('visit_reports')
      .select('*, report_scores(criterion_id, score, comment), report_reserves(text, media_id, position)')
      .eq('request_id', id)
      .eq('status', 'submitted')
      .maybeSingle(),
  ])
  return { request: request.data, report: report.data }
})
if (!data.value?.request || !data.value.report) {
  throw createError({ statusCode: 404, statusMessage: 'Rapport introuvable', fatal: true })
}

const request = computed(() => data.value!.request!)
const report = computed(() => data.value!.report!)
useSeoMeta({ title: () => `Rapport ${request.value.reference}` })

const { data: media } = await useAsyncData(`report-media-${id}`, () =>
  api<ReportMedia[]>(`/api/reports/${id}/media`).catch(() => [] as ReportMedia[]),
)
const photos = computed(() => (media.value ?? []).filter((m) => m.kind === 'photo'))
const videos = computed(() => (media.value ?? []).filter((m) => m.kind === 'video'))
const photoNumber = computed(() => new Map(photos.value.map((p, i) => [p.id, i + 1])))
const photoById = computed(() => new Map(photos.value.map((p) => [p.id, p])))

const scores = computed(() => new Map(report.value.report_scores.map((s) => [s.criterion_id, s])))
const reserves = computed(() => [...report.value.report_reserves].sort((a, b) => a.position - b.position))
const negotiation = computed(() => (report.value.negotiation_points as string[]) ?? [])

const { download, pending, error } = usePdfDownload()
const back = computed(() =>
  role.value === 'user' ? '/rapports' : role.value === 'admin' ? `/admin/demandes/${id}` : '/agent/visites',
)
</script>

<template>
  <div class="mx-auto max-w-[760px]">
    <NuxtLink :to="back" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      <UiIcon :icon="ArrowLeft" :size="16" />
      Retour
    </NuxtLink>
    <UiPageHeader
      title="Rapport de visite"
      :subtitle="`${request.reference}${report.delivered_at ? ` · remis le ${formatDateTimeShort(report.delivered_at)}` : ''}`"
    >
      <template #actions>
        <button type="button" class="btn btn-primary" :disabled="pending === id" @click="download(id)">
          <UiIcon :icon="Download" :size="18" />
          Télécharger le PDF
        </button>
      </template>
    </UiPageHeader>
    <UiAlertBox v-if="error" tone="error" class="mb-4">{{ error }}</UiAlertBox>

    <article class="card overflow-hidden">
      <header class="flex items-start gap-4 border-b border-line px-5 py-[18px]">
        <div class="min-w-0">
          <p class="font-mono text-[11px] tracking-[0.06em] text-muted">{{ request.reference }}</p>
          <h2 class="mt-[3px] text-[17px]">
            {{
              request.property_type ? PROPERTY_TYPE_LABELS[request.property_type as PropertyType] : 'Logement'
            }}
            · {{ request.address }}, {{ request.city }}
          </h2>
          <p class="mt-1 text-[12.5px] text-muted">
            Visité le {{ request.slot_at ? formatSlot(request.slot_at) : '' }} ·
            {{
              report.filming_refused
                ? 'prise de vue refusée par l’agence'
                : `${photos.length} photo${photos.length > 1 ? 's' : ''}, ${videos.length} vidéo${videos.length > 1 ? 's' : ''}`
            }}
          </p>
        </div>
        <UiScoreStamp :score="Number(report.global_score)" class="ml-auto" />
      </header>

      <p class="border-b border-line bg-[#FAFBF9] px-5 py-3 text-[13px] text-muted">
        Moyenne pondérée des critères :
        <b class="font-mono text-ink">{{ formatScore(Number(report.weighted_score)) }}</b>
        <template v-if="report.justification">
          · Note globale ajustée par le visiteur :
          {{ report.justification }}
        </template>
      </p>

      <section v-for="block in blocks" :key="block.id" :aria-labelledby="`rb-${block.id}`">
        <h3 :id="`rb-${block.id}`" class="border-b border-line px-5 pb-2 pt-4 text-sm">
          {{ block.label }}
          <span class="ml-1 font-mono text-xs font-normal text-muted">
            {{ Math.round(block.weight * 100) }} %
          </span>
        </h3>
        <div v-for="c in block.criteria" :key="c.id" class="border-b border-line px-5 py-[11px]">
          <div class="flex items-center gap-3.5">
            <span class="min-w-0 flex-1 text-sm font-medium">{{ c.short_label }}</span>
            <UiScoreBar v-if="scores.get(c.id)?.score" :score="scores.get(c.id)!.score!" />
          </div>
          <p v-if="scores.get(c.id)?.comment" class="mt-1 text-[13px] text-muted">
            {{ scores.get(c.id)!.comment }}
          </p>
        </div>
      </section>
    </article>

    <div class="card mt-[18px] p-[22px]">
      <h2 class="eyebrow">À négocier avant l’entrée</h2>
      <ul v-if="negotiation.length" class="mt-2.5 list-disc pl-5 text-[15px]">
        <li v-for="p in negotiation" :key="p">{{ p }}</li>
      </ul>
      <p v-else class="mt-2.5 text-sm text-muted">Aucun point relevé.</p>

      <div class="my-[18px] border-t border-line" />
      <h2 class="eyebrow">Réserves pour l’état des lieux</h2>
      <ul v-if="reserves.length" class="mt-2.5 grid gap-2.5 text-[15px]">
        <li v-for="(r, i) in reserves" :key="i" class="flex items-start gap-3">
          <img
            v-if="r.media_id && photoById.get(r.media_id)?.url"
            :src="photoById.get(r.media_id)!.url!"
            :alt="`Photo ${photoNumber.get(r.media_id)}`"
            class="h-14 w-14 shrink-0 rounded-md object-cover"
          />
          <span>
            {{ r.text }}
            <span v-if="r.media_id && photoNumber.get(r.media_id)" class="text-sm text-muted">
              (photo {{ photoNumber.get(r.media_id) }})
            </span>
          </span>
        </li>
      </ul>
      <p v-else class="mt-2.5 text-sm text-muted">Aucune réserve relevée.</p>

      <div class="my-[18px] border-t border-line" />
      <h2 class="eyebrow">Conclusion du visiteur</h2>
      <p class="mt-2.5 whitespace-pre-line text-[15px]">{{ report.conclusion }}</p>
      <p v-if="report.recommendation" class="mt-3.5 flex flex-wrap items-center gap-3">
        <span class="eyebrow">Décision recommandée</span>
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand-tint px-[9px] py-1 font-mono text-[11.5px] text-brand-dark"
        >
          <UiIcon :icon="BadgeCheck" :size="14" />
          {{ RECOMMENDATION_LABELS[report.recommendation as Recommendation] }}
        </span>
      </p>
    </div>

    <section class="card mt-[18px] p-[22px]" aria-labelledby="gallery-title">
      <h2 id="gallery-title" class="eyebrow">Photos et vidéos</h2>
      <p v-if="report.filming_refused" class="mt-2.5 flex items-center gap-2 text-sm">
        <UiIcon :icon="CameraOff" :size="18" />
        L’agence a refusé la prise de vue : aucune photo n’a été prise.
      </p>
      <template v-else>
        <ul class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <li v-for="p in photos" :key="p.id">
            <a v-if="p.url" :href="p.url" target="_blank" rel="noopener" class="block">
              <img
                :src="p.url"
                :alt="`Photo ${photoNumber.get(p.id)}`"
                class="aspect-[4/3] w-full rounded-md object-cover"
                loading="lazy"
              />
            </a>
            <span class="mt-1 block font-mono text-[11px] text-muted">Photo {{ photoNumber.get(p.id) }}</span>
          </li>
        </ul>
        <div v-if="videos.length" class="mt-4 grid gap-3">
          <video
            v-for="v in videos"
            :key="v.id"
            :src="v.url ?? undefined"
            controls
            preload="metadata"
            class="w-full rounded-md"
          />
        </div>
      </template>
    </section>
  </div>
</template>
