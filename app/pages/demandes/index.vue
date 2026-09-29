<script setup lang="ts">
import { FilePlus2, Plus } from 'lucide-vue-next'
import { formatEuros } from '#shared/domain/pricing'
import { formatSlot } from '#shared/utils/time'
import type { RequestStatus } from '#shared/domain/stateMachine'
import { PROPERTY_TYPE_LABELS, type PropertyType } from '#shared/schemas/request'

definePageMeta({ layout: 'app', roles: ['user'] })
useSeoMeta({ title: 'Mes demandes' })

const supabase = useSupabaseClient()
const { data: requests } = await useAsyncData('my-requests', async () => {
  const { data } = await supabase
    .from('visit_requests')
    .select(
      'id, reference, status, address, city, property_type, slot_at, proposed_price_cents, agreed_price_cents, urgent_fee_cents, created_at, price_offers(amount_cents, status, author_side)',
    )
    .order('created_at', { ascending: false })
  return data ?? []
})

const ACTIVE: RequestStatus[] = [
  'brouillon',
  'publiee',
  'en_negociation',
  'acceptee',
  'payee',
  'planifiee',
  'realisee',
]
const activeCount = computed(
  () => requests.value?.filter((r) => ACTIVE.includes(r.status as RequestStatus)).length ?? 0,
)

type Row = NonNullable<typeof requests.value>[number]

function title(r: Row) {
  const type = r.property_type ? PROPERTY_TYPE_LABELS[r.property_type as PropertyType] : 'Logement'
  return `${type} · ${r.address ?? 'Adresse à compléter'}${r.city ? `, ${r.city}` : ''}`
}

function price(r: Row): number | null {
  if (r.agreed_price_cents) return r.agreed_price_cents + r.urgent_fee_cents
  const pending = r.price_offers.find((o) => o.status === 'pending')
  return pending?.amount_cents ?? r.proposed_price_cents
}

function detail(r: Row): string {
  const slot = r.slot_at ? `Rendez-vous le ${formatSlot(r.slot_at)}` : 'Rendez-vous à indiquer'
  const pendingOffer = r.price_offers.find((o) => o.status === 'pending')
  const hint: Partial<Record<RequestStatus, string>> = {
    brouillon: 'Brouillon à publier',
    publiee: 'En attente de notre réponse',
    en_negociation:
      pendingOffer?.author_side === 'checkmyflat' ? 'Contre-proposition reçue' : 'Proposition envoyée',
    acceptee: 'Prix accepté, paiement à effectuer',
    payee: 'Payée, visiteur en cours d’assignation',
    planifiee: 'Visiteur assigné',
    realisee: 'Visite réalisée, rapport en préparation',
    rapport_livre: 'Rapport remis',
    annulee: 'Annulée',
    litige: 'Litige en cours',
  }
  return `${slot} · ${hint[r.status as RequestStatus] ?? ''}`
}

function action(r: Row): { label: string; to: string; primary: boolean } {
  switch (r.status) {
    case 'brouillon':
      return { label: 'Compléter', to: `/demandes/${r.id}/modifier`, primary: true }
    case 'en_negociation':
      return { label: 'Répondre', to: `/demandes/${r.id}`, primary: true }
    case 'acceptee':
      return { label: 'Payer', to: `/demandes/${r.id}/paiement`, primary: true }
    case 'rapport_livre':
    case 'litige':
      return { label: 'Voir le rapport', to: `/rapports/${r.id}`, primary: false }
    default:
      return { label: 'Détail', to: `/demandes/${r.id}`, primary: false }
  }
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Mes demandes"
      :subtitle="
        requests?.length
          ? `${activeCount} en cours, ${requests.length - activeCount} terminée(s) ou annulée(s).`
          : undefined
      "
    >
      <template #actions>
        <NuxtLink to="/demandes/nouvelle" class="btn btn-primary">
          <UiIcon :icon="Plus" :size="18" />
          Nouvelle demande
        </NuxtLink>
      </template>
    </UiPageHeader>

    <UiEmptyState
      v-if="!requests?.length"
      :icon="FilePlus2"
      title="Aucune demande pour l’instant"
      text="Repérez une annonce, calez le rendez-vous avec l’agence, et déposez votre première demande de visite."
    >
      <NuxtLink to="/demandes/nouvelle" class="btn btn-primary mt-2">Déposer une demande</NuxtLink>
    </UiEmptyState>

    <ul v-else class="grid gap-3">
      <li v-for="r in requests" :key="r.id" class="panel flex flex-wrap items-center gap-4 px-[18px] py-4">
        <div class="min-w-[200px] flex-1">
          <NuxtLink :to="`/demandes/${r.id}`" class="text-[15.5px] font-semibold hover:underline">
            {{ title(r) }}
          </NuxtLink>
          <div class="mt-[3px] text-[13px] text-muted">
            <span class="font-mono">{{ r.reference }}</span>
            · {{ detail(r) }}
          </div>
        </div>
        <UiStatusTag :status="r.status as RequestStatus" />
        <span
          v-if="price(r)"
          class="font-mono text-base font-semibold"
          :class="{ 'text-muted': r.status === 'annulee' }"
        >
          {{ formatEuros(price(r)!, true) }}
        </span>
        <NuxtLink
          :to="action(r).to"
          class="btn btn-sm"
          :class="action(r).primary ? 'btn-primary' : 'btn-ghost'"
        >
          {{ action(r).label }}
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
