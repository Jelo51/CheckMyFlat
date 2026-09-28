<script setup lang="ts">
import { CircleCheck, Lock } from 'lucide-vue-next'
import { formatEuros, isPaymentOpen, paymentOpensAt } from '#shared/domain/pricing'
import { formatDay, formatSlot } from '#shared/utils/time'

definePageMeta({ layout: 'app', roles: ['user'] })
useSeoMeta({ title: 'Paiement' })

const route = useRoute()
const id = String(route.params.id)
const { data, refresh } = await useRequestDetail(id)
if (!data.value?.request)
  throw createError({ statusCode: 404, statusMessage: 'Demande introuvable', fatal: true })

const request = computed(() => data.value!.request!)
const slot = computed(() => new Date(request.value.slot_at ?? Date.now()))
const total = computed(() => (request.value.agreed_price_cents ?? 0) + request.value.urgent_fee_cents)
const open = computed(() => isPaymentOpen(slot.value, new Date()))
const returning = computed(() => route.query.retour === 'succes')

const pending = ref(false)
const error = ref<string | null>(null)

async function pay() {
  pending.value = true
  error.value = null
  try {
    const { url } = await api<{ url: string }>(`/api/requests/${id}/checkout`, { method: 'POST' })
    window.location.assign(url)
  } catch (e) {
    error.value = errorMessage(e)
    pending.value = false
  }
}

// Retour de Stripe : la confirmation arrive par webhook, on attend le statut.
onMounted(() => {
  if (!returning.value || request.value.status !== 'acceptee') return
  let tries = 0
  const timer = setInterval(async () => {
    tries++
    await refresh()
    if (request.value.status !== 'acceptee' || tries > 20) clearInterval(timer)
  }, 1500)
  onBeforeUnmount(() => clearInterval(timer))
})
</script>

<template>
  <div v-if="data?.request" class="mx-auto max-w-[560px]">
    <UiPageHeader
      title="Paiement"
      subtitle="Une empreinte bancaire est posée maintenant ; le débit a lieu après la visite."
    />

    <div class="card p-6">
      <div class="flex items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div class="text-[15.5px] font-semibold">Visite du {{ formatSlot(slot) }}</div>
          <div class="mt-[3px] text-[13px] text-muted">{{ request.address }}, {{ request.city }}</div>
        </div>
        <div class="font-mono text-base font-semibold">{{ formatEuros(total) }}</div>
      </div>
      <dl class="mt-4 grid gap-1.5 text-sm">
        <div class="flex justify-between">
          <dt class="text-muted">Prix convenu</dt>
          <dd class="font-mono">{{ formatEuros(request.agreed_price_cents ?? 0) }}</dd>
        </div>
        <div v-if="request.urgent_fee_cents" class="flex justify-between">
          <dt class="text-muted">Supplément visite sous 48 h</dt>
          <dd class="font-mono">{{ formatEuros(request.urgent_fee_cents) }}</dd>
        </div>
      </dl>

      <div class="mt-5">
        <UiAlertBox v-if="request.status !== 'acceptee' && request.status !== 'annulee'" tone="success">
          <span class="inline-flex items-center gap-2">
            <UiIcon :icon="CircleCheck" :size="18" />
            Paiement confirmé. Merci !
          </span>
          <NuxtLink :to="`/demandes/${id}`" class="mt-2 block font-semibold underline">
            Retour à la demande
          </NuxtLink>
        </UiAlertBox>
        <UiAlertBox v-else-if="request.status === 'annulee'" tone="warning">
          Cette demande est annulée.
        </UiAlertBox>
        <UiAlertBox v-else-if="returning" tone="info">
          Paiement en cours de confirmation par Stripe… Cette page se met à jour automatiquement.
        </UiAlertBox>
        <UiAlertBox v-else-if="!open" tone="info">
          Le paiement ouvrira le {{ formatDay(paymentOpensAt(slot)) }}, 7 jours avant le rendez-vous.
        </UiAlertBox>
        <template v-else>
          <UiAlertBox v-if="route.query.retour === 'annule'" tone="warning" class="mb-4">
            Paiement interrompu. Vous pouvez réessayer.
          </UiAlertBox>
          <UiAlertBox v-if="error" tone="error" class="mb-4">{{ error }}</UiAlertBox>
          <button type="button" class="btn btn-primary w-full" :disabled="pending" @click="pay">
            Payer {{ formatEuros(total) }}
          </button>
        </template>
      </div>

      <p class="mt-4 flex justify-center gap-2 text-center text-[13px] text-muted">
        <UiIcon :icon="Lock" :size="16" />
        Paiement traité par Stripe. Aucune donnée de carte ne transite par CheckMyFlat.
      </p>
    </div>
  </div>
</template>
