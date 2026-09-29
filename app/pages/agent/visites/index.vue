<script setup lang="ts">
import { CalendarCheck, MapPin, Phone } from 'lucide-vue-next'
import type { RequestStatus } from '#shared/domain/stateMachine'
import { formatSlot } from '#shared/utils/time'
import { PROPERTY_TYPE_LABELS, type PropertyType } from '#shared/schemas/request'

definePageMeta({ layout: 'app', roles: ['agent', 'admin'] })
useSeoMeta({ title: 'Mes visites' })

const supabase = useSupabaseClient()
const { profile } = useProfile()

// Un admin voit aussi toutes les demandes : on filtre explicitement sur l'assignation.
const { data: visits } = await useAsyncData('agent-visits', async () => {
  const { data } = await supabase
    .from('visit_requests')
    .select(
      'id, reference, status, address, postal_code, city, property_type, slot_at, agency_name, agency_phone, priorities',
    )
    .eq('assigned_agent_id', profile.value?.id ?? '')
    .in('status', ['planifiee', 'realisee', 'rapport_livre', 'litige'])
    .order('slot_at')
  return data ?? []
})

const upcoming = computed(() => visits.value?.filter((v) => v.status === 'planifiee') ?? [])
const done = computed(() => (visits.value?.filter((v) => v.status !== 'planifiee') ?? []).reverse())

type Visit = NonNullable<typeof visits.value>[number]
const title = (v: Visit) =>
  `${v.property_type ? PROPERTY_TYPE_LABELS[v.property_type as PropertyType] : 'Logement'} · ${v.address}, ${v.city}`
</script>

<template>
  <div>
    <UiPageHeader title="Mes visites" :subtitle="`${upcoming.length} visite(s) à réaliser.`" />

    <UiEmptyState
      v-if="!visits?.length"
      :icon="CalendarCheck"
      title="Aucune visite assignée"
      text="Les visites qui vous sont confiées apparaîtront ici, avec l’adresse, le créneau et les consignes du client."
    />

    <section v-if="upcoming.length" class="mb-10">
      <h2 class="eyebrow mb-3">À réaliser</h2>
      <ul class="grid gap-3">
        <li v-for="v in upcoming" :key="v.id" class="card p-5">
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-[220px] flex-1">
              <p class="font-mono text-xs text-muted">{{ v.reference }}</p>
              <h3 class="mt-1 text-lg">{{ title(v) }}</h3>
              <p class="mt-1 flex items-center gap-1.5 text-sm font-semibold text-brand-dark">
                <UiIcon :icon="CalendarCheck" :size="16" />
                {{ v.slot_at ? formatSlot(v.slot_at) : '' }}
              </p>
            </div>
            <NuxtLink :to="`/agent/visites/${v.id}`" class="btn btn-primary w-full sm:w-auto">
              Remplir le compte rendu
            </NuxtLink>
          </div>
          <div class="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <a
              :href="`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.address} ${v.postal_code} ${v.city}`)}`"
              target="_blank"
              rel="noopener"
              class="flex items-center gap-2 text-ink underline"
            >
              <UiIcon :icon="MapPin" :size="16" />
              Itinéraire
            </a>
            <a
              v-if="v.agency_phone"
              :href="`tel:${v.agency_phone.replace(/\s/g, '')}`"
              class="flex items-center gap-2 underline"
            >
              <UiIcon :icon="Phone" :size="16" />
              {{ v.agency_name }} · {{ v.agency_phone }}
            </a>
          </div>
          <p v-if="v.priorities" class="mt-3 rounded-md bg-surface px-3 py-2 text-sm">
            <span class="font-semibold">Consignes du client :</span>
            {{ v.priorities }}
          </p>
        </li>
      </ul>
    </section>

    <section v-if="done.length">
      <h2 class="eyebrow mb-3">Réalisées</h2>
      <ul class="grid gap-2">
        <li v-for="v in done" :key="v.id" class="panel flex flex-wrap items-center gap-3 px-4 py-3">
          <span class="min-w-[200px] flex-1 text-sm font-semibold">{{ title(v) }}</span>
          <span class="text-sm text-muted">{{ v.slot_at ? formatSlot(v.slot_at) : '' }}</span>
          <UiStatusTag :status="v.status as RequestStatus" />
          <NuxtLink :to="`/rapports/${v.id}`" class="btn btn-ghost btn-sm">Rapport</NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
