<script setup lang="ts">
import { Plus, Save, Trash2 } from 'lucide-vue-next'
import { formatEuros } from '#shared/domain/pricing'
import { pricingZoneUpdateSchema } from '#shared/schemas/pricing'
import type { ZoneRule } from '#shared/domain/pricing'

definePageMeta({ layout: 'app', roles: ['admin'] })
useSeoMeta({ title: 'Grille tarifaire' })

const supabase = useSupabaseClient()

/** Règle éditée à l'écran (valeurs saisies en texte). */
interface RuleForm {
  priority: number
  kind: ZoneRule['kind']
  lat: string
  lng: string
  radiusKm: string
  communes: string
  polygon: string
}
interface ZoneForm {
  id: string
  code: string
  label: string
  description: string
  price: string
  latePenaltyPct: number
  active: boolean
  rules: RuleForm[]
}

const KIND_LABELS: Record<ZoneRule['kind'], string> = {
  radius: 'Rayon autour d’un point',
  polygon: 'Polygone (quartier)',
  commune: 'Communes',
  default: 'Par défaut (toute autre adresse)',
}

function toRuleForm(priority: number, rule: ZoneRule): RuleForm {
  return {
    priority,
    kind: rule.kind,
    lat: rule.kind === 'radius' ? String(rule.center.lat) : '',
    lng: rule.kind === 'radius' ? String(rule.center.lng) : '',
    radiusKm: rule.kind === 'radius' ? String(rule.radiusKm) : '',
    communes: rule.kind === 'commune' || rule.kind === 'radius' ? (rule.communes ?? []).join(', ') : '',
    polygon: rule.kind === 'polygon' ? rule.polygon.map((p) => `${p.lat} ${p.lng}`).join('\n') : '',
  }
}

function toRule(form: RuleForm): ZoneRule {
  const communes = form.communes
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  switch (form.kind) {
    case 'radius':
      return {
        kind: 'radius',
        center: { lat: Number(form.lat), lng: Number(form.lng) },
        radiusKm: Number(form.radiusKm.replace(',', '.')),
        ...(communes.length ? { communes } : {}),
      }
    case 'polygon':
      return {
        kind: 'polygon',
        polygon: form.polygon
          .split('\n')
          .map((line) =>
            line
              .trim()
              .split(/[\s;,]+/)
              .map(Number),
          )
          .filter((p) => p.length === 2)
          .map(([lat, lng]) => ({ lat: lat!, lng: lng! })),
      }
    case 'commune':
      return { kind: 'commune', communes }
    case 'default':
      return { kind: 'default' }
  }
}

const zones = ref<ZoneForm[]>([])
async function load() {
  const { data } = await supabase
    .from('pricing_zones')
    .select('*, pricing_zone_rules(priority, rule)')
    .order('position')
  zones.value = (data ?? []).map((z) => ({
    id: z.id,
    code: z.code,
    label: z.label,
    description: z.description ?? '',
    price: String(z.base_price_cents / 100).replace('.', ','),
    latePenaltyPct: z.late_penalty_pct,
    active: z.active,
    rules: [...z.pricing_zone_rules]
      .sort((a, b) => a.priority - b.priority)
      .map((r) => toRuleForm(r.priority, r.rule as unknown as ZoneRule)),
  }))
}
await useAsyncData('admin-tarifs', load)

const status = ref<Record<string, { tone: 'success' | 'error'; text: string }>>({})
async function saveZone(zone: ZoneForm) {
  const payload = {
    label: zone.label,
    description: zone.description || null,
    basePriceCents: eurosToCents(zone.price),
    latePenaltyPct: Number(zone.latePenaltyPct),
    active: zone.active,
    rules: zone.rules.map((r) => ({ priority: Number(r.priority), rule: toRule(r) })),
  }
  const parsed = pricingZoneUpdateSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    status.value[zone.id] = { tone: 'error', text: `${issue?.path.join(' › ')} : ${issue?.message}` }
    return
  }
  try {
    await api(`/api/admin/zones/${zone.id}`, { method: 'PUT', body: parsed.data })
    status.value[zone.id] = { tone: 'success', text: 'Zone enregistrée.' }
  } catch (e) {
    status.value[zone.id] = { tone: 'error', text: errorMessage(e) }
  }
}

// Paramètres des médias
const { data: settings } = await useAsyncData('admin-settings', async () => {
  const { data } = await supabase.from('app_settings').select('key, value')
  const map = Object.fromEntries((data ?? []).map((s) => [s.key, Number(s.value)]))
  return {
    maxMediaMb: Math.round((map.max_media_bytes_per_visit ?? 0) / 1024 / 1024),
    maxVideoSeconds: map.max_video_seconds ?? 120,
  }
})
const settingsStatus = ref<{ tone: 'success' | 'error'; text: string } | null>(null)
async function saveSettings() {
  try {
    await api('/api/admin/settings', {
      method: 'PUT',
      body: {
        maxMediaMb: Number(settings.value!.maxMediaMb),
        maxVideoSeconds: Number(settings.value!.maxVideoSeconds),
      },
    })
    settingsStatus.value = { tone: 'success', text: 'Paramètres enregistrés.' }
  } catch (e) {
    settingsStatus.value = { tone: 'error', text: errorMessage(e) }
  }
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Grille tarifaire"
      subtitle="Prix plancher, pénalité d’annulation tardive et règles de rattachement des adresses, par zone."
    />
    <UiAlertBox tone="info" class="mb-6">
      Les règles sont évaluées de la plus petite à la plus grande priorité, toutes zones confondues : la
      première règle satisfaite donne la zone.
    </UiAlertBox>

    <section v-for="zone in zones" :key="zone.id" class="card mb-5 p-5" :aria-labelledby="`zone-${zone.id}`">
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <h2 :id="`zone-${zone.id}`" class="text-lg">{{ zone.label }}</h2>
        <span class="font-mono text-sm text-muted">
          dès {{ formatEuros(eurosToCents(zone.price) || 0, true) }}
        </span>
        <label class="ml-auto flex items-center gap-2 text-sm">
          <input v-model="zone.active" type="checkbox" class="h-4 w-4 accent-brand" />
          Active
        </label>
      </div>
      <div class="grid gap-x-4 sm:grid-cols-[2fr_1fr_1fr]">
        <UiFormField v-slot="{ id }" label="Libellé">
          <input :id="id" v-model="zone.label" class="input" />
        </UiFormField>
        <UiFormField v-slot="{ id }" label="Prix plancher (€)">
          <input :id="id" v-model="zone.price" class="input font-mono" inputmode="decimal" />
        </UiFormField>
        <UiFormField v-slot="{ id }" label="Pénalité < 24 h (%)">
          <input
            :id="id"
            v-model.number="zone.latePenaltyPct"
            type="number"
            min="0"
            max="100"
            class="input font-mono"
          />
        </UiFormField>
      </div>
      <UiFormField v-slot="{ id }" label="Description">
        <input :id="id" v-model="zone.description" class="input" />
      </UiFormField>

      <fieldset>
        <legend class="field-label">Règles de rattachement</legend>
        <div v-for="(rule, i) in zone.rules" :key="i" class="mb-3 rounded-md border border-line p-3">
          <div class="grid gap-2 sm:grid-cols-[90px_1fr_auto]">
            <div>
              <label :for="`prio-${zone.id}-${i}`" class="field-label">Priorité</label>
              <input
                :id="`prio-${zone.id}-${i}`"
                v-model.number="rule.priority"
                type="number"
                class="input font-mono"
              />
            </div>
            <div>
              <label :for="`kind-${zone.id}-${i}`" class="field-label">Type</label>
              <select :id="`kind-${zone.id}-${i}`" v-model="rule.kind" class="input">
                <option v-for="(label, kind) in KIND_LABELS" :key="kind" :value="kind">{{ label }}</option>
              </select>
            </div>
            <button
              type="button"
              class="btn btn-ghost h-11 w-11 self-end !p-0"
              :aria-label="`Retirer la règle ${i + 1}`"
              @click="zone.rules.splice(i, 1)"
            >
              <UiIcon :icon="Trash2" :size="16" />
            </button>
          </div>
          <div v-if="rule.kind === 'radius'" class="mt-2 grid gap-2 sm:grid-cols-3">
            <div>
              <label :for="`lat-${zone.id}-${i}`" class="field-label">Latitude du centre</label>
              <input
                :id="`lat-${zone.id}-${i}`"
                v-model="rule.lat"
                class="input font-mono"
                inputmode="decimal"
              />
            </div>
            <div>
              <label :for="`lng-${zone.id}-${i}`" class="field-label">Longitude du centre</label>
              <input
                :id="`lng-${zone.id}-${i}`"
                v-model="rule.lng"
                class="input font-mono"
                inputmode="decimal"
              />
            </div>
            <div>
              <label :for="`rad-${zone.id}-${i}`" class="field-label">Rayon (km)</label>
              <input
                :id="`rad-${zone.id}-${i}`"
                v-model="rule.radiusKm"
                class="input font-mono"
                inputmode="decimal"
              />
            </div>
          </div>
          <div v-if="rule.kind === 'radius' || rule.kind === 'commune'" class="mt-2">
            <label :for="`com-${zone.id}-${i}`" class="field-label">
              {{ rule.kind === 'radius' ? 'Limité aux communes (facultatif)' : 'Communes' }}
            </label>
            <input
              :id="`com-${zone.id}-${i}`"
              v-model="rule.communes"
              class="input"
              placeholder="Reims, Bétheny"
            />
          </div>
          <div v-if="rule.kind === 'polygon'" class="mt-2">
            <label :for="`poly-${zone.id}-${i}`" class="field-label">
              Sommets (« latitude longitude », un par ligne)
            </label>
            <textarea
              :id="`poly-${zone.id}-${i}`"
              v-model="rule.polygon"
              class="input font-mono text-sm"
              rows="4"
            />
          </div>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          @click="
            zone.rules.push({
              priority: 100,
              kind: 'commune',
              lat: '',
              lng: '',
              radiusKm: '',
              communes: '',
              polygon: '',
            })
          "
        >
          <UiIcon :icon="Plus" :size="16" />
          Ajouter une règle
        </button>
      </fieldset>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" class="btn btn-primary btn-sm" @click="saveZone(zone)">
          <UiIcon :icon="Save" :size="16" />
          Enregistrer la zone
        </button>
        <span
          v-if="status[zone.id]"
          class="text-sm"
          :class="status[zone.id]!.tone === 'error' ? 'text-danger' : 'text-brand-dark'"
          role="status"
        >
          {{ status[zone.id]!.text }}
        </span>
      </div>
    </section>

    <section v-if="settings" class="card p-5" aria-labelledby="media-settings">
      <h2 id="media-settings" class="mb-4 text-lg">Médias par visite</h2>
      <div class="grid gap-x-4 sm:grid-cols-2">
        <UiFormField v-slot="{ id }" label="Volume maximal (Mo)">
          <input
            :id="id"
            v-model.number="settings.maxMediaMb"
            type="number"
            min="10"
            class="input font-mono"
          />
        </UiFormField>
        <UiFormField v-slot="{ id }" label="Durée maximale d’une vidéo (secondes)">
          <input
            :id="id"
            v-model.number="settings.maxVideoSeconds"
            type="number"
            min="10"
            class="input font-mono"
          />
        </UiFormField>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="btn btn-primary btn-sm" @click="saveSettings">Enregistrer</button>
        <span
          v-if="settingsStatus"
          class="text-sm"
          :class="settingsStatus.tone === 'error' ? 'text-danger' : 'text-brand-dark'"
          role="status"
        >
          {{ settingsStatus.text }}
        </span>
      </div>
    </section>
  </div>
</template>
