<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import { formatEuros } from '#shared/domain/pricing'
import { formatScore } from '#shared/domain/scoring'
import { REQUEST_STATUSES, STATUS_LABELS, type RequestStatus } from '#shared/domain/stateMachine'
import { formatSlot } from '#shared/utils/time'
import { PROPERTY_TYPE_LABELS, type PropertyType } from '#shared/schemas/request'

definePageMeta({ layout: 'app', roles: ['admin'] })
useSeoMeta({ title: 'Demandes de visite' })

const supabase = useSupabaseClient()
const route = useRoute()
const router = useRouter()

interface Stats {
  byStatus: Partial<Record<RequestStatus, number>>
  revenueMonthCents: number
  avgDeliveryHours: number | null
  avgGlobalScore: number | null
  deliveredLast30Days: number
}

const statusFilter = computed(() => (route.query.statut as RequestStatus | undefined) ?? null)
const zoneFilter = computed(() => (route.query.zone as string | undefined) ?? null)
const search = ref(String(route.query.q ?? ''))

const { data: zones } = await useAsyncData('admin-zones-list', async () => {
  const { data } = await supabase.from('pricing_zones').select('id, code, label').order('position')
  return data ?? []
})

const { data: stats } = await useAsyncData('admin-stats', async () => {
  const { data } = await supabase.rpc('admin_stats')
  return data as unknown as Stats
})

const { data: requests } = await useAsyncData(
  'admin-requests',
  async () => {
    let query = supabase
      .from('visit_requests')
      .select(
        'id, reference, status, address, city, property_type, slot_at, proposed_price_cents, agreed_price_cents, urgent_fee_cents, created_at, deleted_at, zone_id, pricing_zones(code, label), profiles!visit_requests_user_id_fkey(full_name, email), price_offers(status, author_side)',
      )
      .is('deleted_at', null)
      .order('slot_at', { ascending: true, nullsFirst: false })
      .limit(200)
    if (statusFilter.value) query = query.eq('status', statusFilter.value)
    else query = query.neq('status', 'brouillon')
    if (zoneFilter.value === 'aucune') query = query.is('zone_id', null)
    else if (zoneFilter.value) query = query.eq('zone_id', zoneFilter.value)
    // Caractères réservés de la syntaxe de filtre PostgREST retirés.
    const q = search.value.trim().replace(/[%,().*]/g, '')
    if (q) query = query.or(`reference.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%`)
    const { data } = await query
    return data ?? []
  },
  { watch: [statusFilter, zoneFilter] },
)

function setFilter(key: 'statut' | 'zone' | 'q', value: string | null) {
  router.replace({ query: { ...route.query, [key]: value || undefined } })
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    setFilter('q', value)
    refreshNuxtData('admin-requests')
  }, 350)
})

const activeCount = computed(() =>
  (
    ['publiee', 'en_negociation', 'acceptee', 'payee', 'planifiee', 'realisee', 'litige'] as RequestStatus[]
  ).reduce((n, s) => n + (stats.value?.byStatus[s] ?? 0), 0),
)

type Row = NonNullable<typeof requests.value>[number]

/** À traiter par l'équipe : proposition du client en attente, visite payée non assignée, litige. */
function needsAction(r: Row) {
  return (
    r.status === 'payee' ||
    r.status === 'litige' ||
    ((r.status === 'publiee' || r.status === 'en_negociation') &&
      r.price_offers.some((o) => o.status === 'pending' && o.author_side === 'client')) ||
    ((r.status === 'publiee' || r.status === 'en_negociation') && !r.zone_id)
  )
}

function price(r: Row) {
  return r.agreed_price_cents ? r.agreed_price_cents + r.urgent_fee_cents : r.proposed_price_cents
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Demandes de visite"
      :subtitle="`${activeCount} demande(s) active(s), ${requests?.filter(needsAction).length ?? 0} à traiter.`"
    />

    <dl class="mb-6 grid grid-cols-2 gap-3.5 md:grid-cols-4">
      <div class="panel flex flex-col p-4">
        <dt class="text-[12.5px] text-muted">demandes actives</dt>
        <dd class="order-first font-mono text-[25px] font-semibold">{{ activeCount }}</dd>
      </div>
      <div class="panel flex flex-col p-4">
        <dt class="text-[12.5px] text-muted">encaissé ce mois</dt>
        <dd class="order-first font-mono text-[25px] font-semibold">
          {{ formatEuros(stats?.revenueMonthCents ?? 0, true) }}
        </dd>
      </div>
      <div class="panel flex flex-col p-4">
        <dt class="text-[12.5px] text-muted">délai moyen visite → rapport (30 j)</dt>
        <dd class="order-first font-mono text-[25px] font-semibold">
          {{
            stats?.avgDeliveryHours != null ? `${String(stats.avgDeliveryHours).replace('.', ',')} h` : '—'
          }}
        </dd>
      </div>
      <div class="panel flex flex-col p-4">
        <dt class="text-[12.5px] text-muted">note moyenne remise (30 j)</dt>
        <dd class="order-first font-mono text-[25px] font-semibold">
          {{ stats?.avgGlobalScore != null ? formatScore(Number(stats.avgGlobalScore)) : '—' }}
        </dd>
      </div>
    </dl>

    <nav aria-label="Filtrer par statut" class="mb-3 flex flex-wrap gap-1.5">
      <button
        type="button"
        class="rounded-full border px-3 py-1 text-[13px] font-semibold"
        :class="!statusFilter ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-muted'"
        :aria-pressed="!statusFilter"
        @click="setFilter('statut', null)"
      >
        Toutes
      </button>
      <button
        v-for="s in REQUEST_STATUSES"
        :key="s"
        type="button"
        class="rounded-full border px-3 py-1 text-[13px] font-semibold"
        :class="
          statusFilter === s ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-muted'
        "
        :aria-pressed="statusFilter === s"
        @click="setFilter('statut', s)"
      >
        {{ STATUS_LABELS[s] }}
        <span class="ml-1 font-mono text-xs">{{ stats?.byStatus[s] ?? 0 }}</span>
      </button>
    </nav>

    <div class="mb-4 flex flex-wrap gap-3">
      <div class="relative min-w-[220px] flex-1">
        <label for="admin-search" class="sr-only">Rechercher</label>
        <UiIcon :icon="Search" :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          id="admin-search"
          v-model="search"
          type="search"
          class="input pl-10"
          placeholder="Référence, adresse, ville"
        />
      </div>
      <label for="zone-filter" class="sr-only">Zone</label>
      <select
        id="zone-filter"
        :value="zoneFilter ?? ''"
        class="input max-w-[260px]"
        @change="setFilter('zone', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">Toutes les zones</option>
        <option v-for="z in zones" :key="z.id" :value="z.id">{{ z.label }}</option>
        <option value="aucune">Zone à fixer</option>
      </select>
    </div>

    <div class="overflow-x-auto rounded-lg border border-line">
      <table class="table min-w-[760px]">
        <thead>
          <tr>
            <th scope="col">Logement</th>
            <th scope="col">Client</th>
            <th scope="col">Créneau</th>
            <th scope="col">Zone</th>
            <th scope="col">Prix</th>
            <th scope="col">État</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!requests?.length">
            <td colspan="7" class="text-center text-muted">Aucune demande.</td>
          </tr>
          <tr v-for="r in requests" :key="r.id">
            <td>
              <b>
                {{ r.property_type ? PROPERTY_TYPE_LABELS[r.property_type as PropertyType] : 'Logement' }} ·
                {{ r.city }}
              </b>
              <div class="text-[13px] text-muted">
                {{ r.address }} ·
                <span class="font-mono">{{ r.reference }}</span>
              </div>
            </td>
            <td class="text-[13px]">{{ r.profiles?.full_name ?? r.profiles?.email }}</td>
            <td class="whitespace-nowrap">{{ r.slot_at ? formatSlot(r.slot_at) : '—' }}</td>
            <td>{{ r.pricing_zones?.code?.toUpperCase() ?? '—' }}</td>
            <td class="font-mono font-semibold">{{ price(r) ? formatEuros(price(r)!, true) : '—' }}</td>
            <td>
              <div class="flex flex-col items-start gap-1">
                <UiStatusTag :status="r.status as RequestStatus" />
                <span v-if="needsAction(r)" class="text-xs font-semibold text-warn">À traiter</span>
              </div>
            </td>
            <td>
              <NuxtLink
                :to="`/admin/demandes/${r.id}`"
                class="btn btn-sm"
                :class="needsAction(r) ? 'btn-primary' : 'btn-ghost'"
              >
                Ouvrir
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
