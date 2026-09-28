<script setup lang="ts">
import {
  CalendarCheck,
  Check,
  CloudOff,
  Loader2,
  MessageSquarePlus,
  Minus,
  Phone,
  Plus,
  Send,
  Trash2,
} from 'lucide-vue-next'
import {
  blockAverage,
  formatScore,
  needsJustification,
  roundScore,
  weightedScore,
} from '#shared/domain/scoring'
import { RECOMMENDATIONS, RECOMMENDATION_LABELS, visitReportSubmitSchema } from '#shared/schemas/visitReport'
import { formatSlot } from '#shared/utils/time'
import { PROPERTY_TYPE_LABELS, type PropertyType } from '#shared/schemas/request'

definePageMeta({ layout: 'app', roles: ['agent', 'admin'] })

const route = useRoute()
const id = String(route.params.id)
const supabase = useSupabaseClient()
const { profile } = useProfile()

const { data: request } = await useAsyncData(`visit-${id}`, async () => {
  const { data } = await supabase.from('visit_requests').select('*').eq('id', id).maybeSingle()
  return data
})
if (!request.value || request.value.assigned_agent_id !== profile.value?.id) {
  throw createError({ statusCode: 404, statusMessage: 'Visite introuvable', fatal: true })
}
useSeoMeta({ title: `Compte rendu ${request.value.reference}` })

const { data: settings } = await useAsyncData('visit-settings', async () => {
  const { data } = await supabase.from('app_settings').select('key, value')
  const map = Object.fromEntries((data ?? []).map((s) => [s.key, Number(s.value)]))
  return {
    maxBytes: map.max_media_bytes_per_visit ?? 500 * 1024 * 1024,
    maxVideoSeconds: map.max_video_seconds ?? 120,
    maxDimension: map.image_max_dimension ?? 2560,
  }
})

const { blocks, scoringBlocks, iconFor } = useCriteria()
const { state, media, saveState, savedAt, load, loadMedia, save } = useVisitReport(id)
const editable = computed(() => request.value?.status === 'planifiee')

onMounted(load)

// Chaque critère a une entrée dans l'état.
watchEffect(() => {
  for (const b of blocks.value) {
    for (const c of b.criteria) state.scores[c.id] ??= { score: null, comment: '' }
  }
})

const scoreMap = computed(() =>
  Object.fromEntries(Object.entries(state.scores).map(([k, v]) => [k, v.score])),
)
const weighted = computed(() => weightedScore(scoringBlocks.value, scoreMap.value))
const ratedCount = computed(() => Object.values(scoreMap.value).filter((s) => s !== null).length)
const criteriaCount = computed(() => scoringBlocks.value.reduce((n, b) => n + b.criterionIds.length, 0))
const gapNeedsJustification = computed(
  () =>
    state.globalScore !== null &&
    weighted.value !== null &&
    needsJustification(state.globalScore, weighted.value),
)

const openComments = ref(new Set<string>())
function toggleComment(criterionId: string) {
  const next = new Set(openComments.value)
  if (next.has(criterionId)) next.delete(criterionId)
  else next.add(criterionId)
  openComments.value = next
}

function stepGlobal(delta: number) {
  const base = state.globalScore ?? (weighted.value ? roundScore(weighted.value) : 3)
  state.globalScore = Math.min(5, Math.max(1, Math.round((base + delta) * 10) / 10))
}
function useWeighted() {
  if (weighted.value !== null) state.globalScore = Math.round(weighted.value * 10) / 10
}
function onGlobalInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value.replace(',', '.')
  const n = Number(raw)
  state.globalScore = raw === '' || Number.isNaN(n) ? null : n
}

const photos = computed(() => media.value.filter((m) => m.kind === 'photo'))

// Soumission
const issues = ref<string[]>([])
const submitting = ref(false)
const submitError = ref<string | null>(null)
const submitted = ref(false)

async function submit() {
  issues.value = []
  submitError.value = null
  const parsed = visitReportSubmitSchema({
    blocks: scoringBlocks.value,
    mediaCount: media.value.length,
  }).safeParse(toDraft(state))
  if (!parsed.success) {
    issues.value = [...new Set(parsed.error.issues.map((i) => i.message))]
    await nextTick()
    document.getElementById('submit-issues')?.focus()
    return
  }
  submitting.value = true
  try {
    if (!(await save())) throw new Error('Enregistrement impossible : vérifiez votre connexion.')
    await api(`/api/visits/${id}/submit`, { method: 'POST' })
    submitted.value = true
  } catch (e) {
    submitError.value = e instanceof Error && !('data' in e) ? e.message : errorMessage(e)
  } finally {
    submitting.value = false
  }
}

const title = computed(() => {
  const r = request.value!
  return `${r.property_type ? PROPERTY_TYPE_LABELS[r.property_type as PropertyType] : 'Logement'} · ${r.address}, ${r.city}`
})
</script>

<template>
  <div v-if="request" class="mx-auto max-w-[840px]">
    <UiPageHeader
      title="Compte rendu de visite"
      :subtitle="`${title} — ${request.slot_at ? formatSlot(request.slot_at) : ''}`"
    >
      <template #actions>
        <span class="flex items-center gap-1.5 text-[13px] text-muted" role="status" aria-live="polite">
          <template v-if="saveState === 'saving'">
            <UiIcon :icon="Loader2" :size="16" class="animate-spin" />
            Enregistrement…
          </template>
          <template v-else-if="saveState === 'offline'">
            <UiIcon :icon="CloudOff" :size="16" />
            Hors ligne : enregistré sur l’appareil
          </template>
          <template v-else-if="saveState === 'error'">
            Échec de l’enregistrement, nouvel essai à la prochaine saisie
          </template>
          <template v-else-if="savedAt">
            <UiIcon :icon="Check" :size="16" />
            Enregistré à {{ savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }}
          </template>
        </span>
      </template>
    </UiPageHeader>

    <UiAlertBox v-if="submitted" tone="success" class="mb-6">
      Compte rendu envoyé. Le rapport est remis au client.
      <NuxtLink :to="`/rapports/${id}`" class="font-semibold underline">Voir le rapport</NuxtLink>
    </UiAlertBox>
    <UiAlertBox v-else-if="!editable" tone="info" class="mb-6">
      Ce compte rendu a déjà été soumis.
      <NuxtLink :to="`/rapports/${id}`" class="font-semibold underline">Voir le rapport</NuxtLink>
    </UiAlertBox>

    <template v-if="editable && !submitted">
      <!-- Infos pratiques -->
      <div class="card mb-4 grid gap-2 p-4 text-sm">
        <p class="flex items-center gap-2">
          <UiIcon :icon="CalendarCheck" :size="18" class="text-brand-dark" />
          <b>{{ request.slot_at ? formatSlot(request.slot_at) : '' }}</b>
          · {{ request.address }}, {{ request.postal_code }} {{ request.city }}
        </p>
        <a
          :href="`tel:${request.agency_phone?.replace(/\s/g, '')}`"
          class="flex items-center gap-2 underline"
        >
          <UiIcon :icon="Phone" :size="18" />
          {{ request.agency_name }} · {{ request.agency_phone }}
        </a>
        <p v-if="request.priorities" class="rounded-md bg-surface px-3 py-2">
          <b>Consignes du client :</b>
          {{ request.priorities }}
        </p>
      </div>

      <!-- Prise de vue -->
      <div class="mb-[18px] flex items-start gap-3 rounded-md bg-brand-tint px-[18px] py-4 text-sm">
        <input
          id="filming-refused"
          v-model="state.filmingRefused"
          type="checkbox"
          class="mt-1 h-5 w-5 shrink-0 accent-brand"
        />
        <label for="filming-refused">
          <b>Prise de vue refusée par l’agence.</b>
          Cochez si l’agence ou le propriétaire a refusé : la mention sera portée au rapport et les photos
          deviennent facultatives.
        </label>
      </div>

      <!-- Critères -->
      <section
        v-for="block in blocks"
        :key="block.id"
        class="panel mb-4 overflow-hidden"
        :aria-labelledby="`block-${block.id}`"
      >
        <div class="flex items-center gap-2.5 border-b border-line bg-[#FAFBF9] px-[18px] py-3.5">
          <UiIcon :icon="iconFor(block.icon)" class="text-muted" />
          <h2 :id="`block-${block.id}`" class="text-[15.5px]">{{ block.label }}</h2>
          <span class="ml-auto font-mono text-[13px] text-muted">
            {{ Math.round(block.weight * 100) }} % · moyenne
            {{
              blockAverage(
                scoringBlocks.find((b) => b.id === block.id)!,
                scoreMap,
              ) === null
                ? '—'
                : formatScore(
                    blockAverage(
                      scoringBlocks.find((b) => b.id === block.id)!,
                      scoreMap,
                    )!,
                  )
            }}
          </span>
        </div>
        <div
          v-for="c in block.criteria"
          :key="c.id"
          class="border-b border-line px-[18px] py-3.5 last:border-b-0"
        >
          <div class="flex flex-wrap items-center gap-3">
            <span :id="`label-${c.id}`" class="min-w-[220px] flex-1 text-[14.5px]">{{ c.label }}</span>
            <UiRatingInput
              v-if="state.scores[c.id]"
              v-model="state.scores[c.id]!.score"
              :label="c.label"
              :name="c.id"
            />
            <button
              type="button"
              class="grid h-11 w-11 place-items-center rounded-[7px] border border-line-strong sm:h-[34px] sm:w-[38px]"
              :class="state.scores[c.id]?.comment ? 'border-ink text-ink' : 'text-muted'"
              :aria-expanded="openComments.has(c.id)"
              :aria-label="`Commentaire : ${c.label}`"
              @click="toggleComment(c.id)"
            >
              <UiIcon :icon="MessageSquarePlus" :size="18" />
            </button>
          </div>
          <div
            v-if="state.scores[c.id] && (openComments.has(c.id) || state.scores[c.id]!.comment)"
            class="mt-2.5"
          >
            <label :for="`comment-${c.id}`" class="sr-only">Commentaire : {{ c.label }}</label>
            <textarea
              :id="`comment-${c.id}`"
              v-model="state.scores[c.id]!.comment"
              class="input min-h-[56px]"
              rows="2"
              maxlength="1000"
              placeholder="Commentaire (facultatif)"
            />
          </div>
        </div>
      </section>

      <!-- Médias -->
      <section class="panel mb-4 p-[18px]" aria-labelledby="media-title">
        <h2 id="media-title" class="text-[15.5px]">Photos et vidéos</h2>
        <p class="field-hint mb-3 mt-1">
          {{
            state.filmingRefused
              ? 'Facultatif : la prise de vue a été refusée.'
              : 'Au moins une photo. Vidéos de 2 minutes maximum.'
          }}
        </p>
        <VisitMediaUploader
          :request-id="id"
          :media="media"
          :max-bytes="settings!.maxBytes"
          :max-video-seconds="settings!.maxVideoSeconds"
          :max-dimension="settings!.maxDimension"
          @changed="loadMedia"
        />
      </section>

      <!-- Bilan -->
      <section class="panel mb-4 p-[18px]" aria-labelledby="bilan-title">
        <h2 id="bilan-title" class="mb-4 text-[15.5px]">Bilan et décision</h2>

        <div class="mb-5 flex flex-wrap items-center gap-4">
          <div class="min-w-[200px] flex-1">
            <p class="field-label">Note globale du logement</p>
            <p class="field-hint mt-0.5">
              Moyenne pondérée des quatre blocs :
              <b class="font-mono text-ink">{{ weighted === null ? '—' : formatScore(weighted) }}</b>
              ({{ ratedCount }}/{{ criteriaCount }} critères notés). Vous restez libre de la corriger.
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="btn btn-ghost h-11 w-11 !p-0"
              aria-label="Diminuer de 0,1"
              @click="stepGlobal(-0.1)"
            >
              <UiIcon :icon="Minus" :size="18" />
            </button>
            <label for="global-score" class="sr-only">Note globale sur 5</label>
            <input
              id="global-score"
              :value="state.globalScore === null ? '' : formatScore(state.globalScore)"
              class="input h-11 w-20 text-center font-mono text-lg font-semibold"
              inputmode="decimal"
              @change="onGlobalInput"
            />
            <button
              type="button"
              class="btn btn-ghost h-11 w-11 !p-0"
              aria-label="Augmenter de 0,1"
              @click="stepGlobal(0.1)"
            >
              <UiIcon :icon="Plus" :size="18" />
            </button>
          </div>
          <button v-if="weighted !== null" type="button" class="btn btn-ghost btn-sm" @click="useWeighted">
            Reprendre la moyenne
          </button>
        </div>

        <div v-if="gapNeedsJustification" class="mb-4">
          <UiAlertBox tone="warning" class="mb-2">
            Écart de plus d’un point avec la moyenne pondérée : une justification est obligatoire.
          </UiAlertBox>
          <label for="justification" class="field-label">Justification de la note globale</label>
          <textarea
            id="justification"
            v-model="state.justification"
            class="input"
            rows="3"
            maxlength="2000"
          />
        </div>

        <fieldset class="mb-4">
          <legend class="field-label">Petits travaux ou équipements à négocier avant l’entrée</legend>
          <ul class="grid gap-2">
            <li v-for="(_, i) in state.negotiationPoints" :key="i" class="flex gap-2">
              <label :for="`nego-${i}`" class="sr-only">Point à négocier {{ i + 1 }}</label>
              <input :id="`nego-${i}`" v-model="state.negotiationPoints[i]" class="input" maxlength="300" />
              <button
                type="button"
                class="btn btn-ghost h-11 w-11 shrink-0 !p-0"
                :aria-label="`Retirer le point ${i + 1}`"
                @click="state.negotiationPoints.splice(i, 1)"
              >
                <UiIcon :icon="Trash2" :size="16" />
              </button>
            </li>
          </ul>
          <button type="button" class="btn btn-ghost btn-sm mt-2" @click="state.negotiationPoints.push('')">
            <UiIcon :icon="Plus" :size="16" />
            Ajouter un point
          </button>
        </fieldset>

        <fieldset class="mb-4">
          <legend class="field-label">Réserves pour le futur état des lieux</legend>
          <ul class="grid gap-3">
            <li
              v-for="(reserve, i) in state.reserves"
              :key="i"
              class="grid gap-2 sm:grid-cols-[1fr_150px_auto]"
            >
              <label :for="`reserve-${i}`" class="sr-only">Réserve {{ i + 1 }}</label>
              <input
                :id="`reserve-${i}`"
                v-model="reserve.text"
                class="input"
                maxlength="500"
                placeholder="Défaut constaté"
              />
              <label :for="`reserve-photo-${i}`" class="sr-only">
                Photo associée à la réserve {{ i + 1 }}
              </label>
              <select :id="`reserve-photo-${i}`" v-model="reserve.mediaId" class="input">
                <option :value="null">Sans photo</option>
                <option v-for="(p, n) in photos" :key="p.id" :value="p.id">Photo {{ n + 1 }}</option>
              </select>
              <button
                type="button"
                class="btn btn-ghost h-11 w-11 !p-0"
                :aria-label="`Retirer la réserve ${i + 1}`"
                @click="state.reserves.splice(i, 1)"
              >
                <UiIcon :icon="Trash2" :size="16" />
              </button>
            </li>
          </ul>
          <button
            type="button"
            class="btn btn-ghost btn-sm mt-2"
            @click="state.reserves.push({ text: '', mediaId: null })"
          >
            <UiIcon :icon="Plus" :size="16" />
            Ajouter une réserve
          </button>
        </fieldset>

        <label for="conclusion" class="field-label">Conclusion du visiteur</label>
        <textarea
          id="conclusion"
          v-model="state.conclusion"
          class="input mb-4"
          rows="3"
          maxlength="1000"
          placeholder="En quelques lignes : ce qu’il faut retenir de la visite."
        />

        <fieldset>
          <legend class="field-label">Action recommandée</legend>
          <div class="flex flex-wrap gap-2.5">
            <button
              v-for="r in RECOMMENDATIONS"
              :key="r"
              type="button"
              class="rounded-[9px] border px-[15px] py-2.5 text-sm font-semibold"
              :class="
                state.recommendation === r
                  ? 'border-ink text-ink shadow-[inset_0_0_0_1px_theme(colors.ink.DEFAULT)]'
                  : 'border-line-strong text-muted'
              "
              :aria-pressed="state.recommendation === r"
              @click="state.recommendation = r"
            >
              {{ RECOMMENDATION_LABELS[r] }}
            </button>
          </div>
        </fieldset>
      </section>

      <div v-if="issues.length" id="submit-issues" tabindex="-1" class="mb-4">
        <UiAlertBox tone="error">
          <p class="font-semibold">Avant d’envoyer :</p>
          <ul class="mt-1 list-disc pl-5">
            <li v-for="issue in issues" :key="issue">{{ issue }}</li>
          </ul>
        </UiAlertBox>
      </div>
      <UiAlertBox v-if="submitError" tone="error" class="mb-4">{{ submitError }}</UiAlertBox>

      <div class="flex flex-wrap gap-3 pb-8">
        <button type="button" class="btn btn-primary" :disabled="submitting" @click="submit">
          <UiIcon :icon="Send" :size="18" />
          Générer le rapport et le remettre au client
        </button>
        <button type="button" class="btn btn-ghost" :disabled="submitting" @click="save">
          Enregistrer le brouillon
        </button>
      </div>
    </template>
  </div>
</template>
