<script setup lang="ts">
import { CreditCard, FileText, Pencil, Trash2, TriangleAlert, XCircle } from 'lucide-vue-next'
import { cancellationOutcome, formatEuros, isPaymentOpen, paymentOpensAt } from '#shared/domain/pricing'
import { isEditable, STATUS_LABELS, type RequestStatus } from '#shared/domain/stateMachine'
import { formatDateTimeShort, formatDay, formatSlot } from '#shared/utils/time'
import { PROPERTY_TYPE_LABELS, type PropertyType } from '#shared/schemas/request'

definePageMeta({ layout: 'app', roles: ['user'] })

const route = useRoute()
const id = String(route.params.id)
const { data, refresh } = await useRequestDetail(id)
if (!data.value?.request)
  throw createError({ statusCode: 404, statusMessage: 'Demande introuvable', fatal: true })

const request = computed(() => data.value!.request!)
const status = computed(() => request.value.status as RequestStatus)
useSeoMeta({ title: () => request.value.reference })

const title = computed(() => {
  const r = request.value
  const type = r.property_type ? PROPERTY_TYPE_LABELS[r.property_type as PropertyType] : 'Logement'
  return `${type} · ${r.address ?? 'Adresse à compléter'}${r.city ? `, ${r.city}` : ''}`
})

const total = computed(() =>
  request.value.agreed_price_cents ? request.value.agreed_price_cents + request.value.urgent_fee_cents : null,
)
const slot = computed(() => (request.value.slot_at ? new Date(request.value.slot_at) : null))
const paymentOpen = computed(() => !!slot.value && isPaymentOpen(slot.value, new Date()))
const pendingOffer = computed(() => data.value!.offers.find((o) => o.status === 'pending'))
const negotiationOpen = computed(() => status.value === 'publiee' || status.value === 'en_negociation')
const paid = computed(() =>
  data.value!.payments.find((p) => p.status === 'authorized' || p.status === 'captured'),
)

const canCancel = computed(() =>
  ['brouillon', 'publiee', 'en_negociation', 'acceptee', 'payee', 'planifiee'].includes(status.value),
)
const canDispute = computed(() => status.value === 'realisee' || status.value === 'rapport_livre')
const canDelete = computed(() => {
  if (!paid.value && ['brouillon', 'publiee', 'en_negociation', 'acceptee', 'annulee'].includes(status.value))
    return true
  return status.value === 'annulee' || status.value === 'rapport_livre'
})

/** Aperçu de la pénalité si le client annule maintenant. */
const cancelPreview = computed(() => {
  if (!paid.value || !slot.value) return null
  return cancellationOutcome({
    paidCents: paid.value.amount_cents,
    cancelledBy: 'owner',
    slotAt: slot.value,
    now: new Date(),
    latePenaltyPct: request.value.pricing_zones?.late_penalty_pct ?? 0,
  })
})

const refund = computed(() => {
  const p = data.value!.payments.find((x) =>
    ['canceled', 'refunded', 'partially_refunded', 'captured'].includes(x.status),
  )
  if (!p || status.value !== 'annulee') return null
  if (p.status === 'canceled') return 'Empreinte bancaire libérée : aucun débit.'
  if (p.refunded_cents > 0) return `Remboursement de ${formatEuros(p.refunded_cents)} effectué.`
  if (p.captured_cents < p.amount_cents)
    return `Pénalité d’annulation tardive : ${formatEuros(p.captured_cents)} débités.`
  return 'Remboursement en cours.'
})

const cancelReason = computed(
  () =>
    [...data.value!.events].reverse().find((e) => e.to_status === status.value && e.reason)?.reason ?? null,
)

// Actions
const cancelDialog = ref<{ open: () => void; close: () => void } | null>(null)
const disputeDialog = ref<{ open: () => void; close: () => void } | null>(null)
const deleteDialog = ref<{ open: () => void; close: () => void } | null>(null)
const pending = ref(false)
const actionError = ref<string | null>(null)

async function act(fn: () => Promise<unknown>, dialog: { close: () => void } | null) {
  pending.value = true
  actionError.value = null
  try {
    await fn()
    dialog?.close()
    await refresh()
  } catch (e) {
    actionError.value = errorMessage(e)
  } finally {
    pending.value = false
  }
}

const cancel = (reason: string) =>
  act(() => api(`/api/requests/${id}/cancel`, { method: 'POST', body: { reason } }), cancelDialog.value)
const dispute = (reason: string) =>
  act(() => api(`/api/requests/${id}/dispute`, { method: 'POST', body: { reason } }), disputeDialog.value)
async function remove() {
  pending.value = true
  actionError.value = null
  try {
    await api(`/api/requests/${id}`, { method: 'DELETE' })
    await navigateTo('/demandes')
  } catch (e) {
    actionError.value = errorMessage(e)
    pending.value = false
  }
}
</script>

<template>
  <div v-if="data?.request">
    <UiPageHeader
      :title="title"
      :subtitle="`${request.reference} · ${slot ? `rendez-vous le ${formatSlot(slot)}` : 'rendez-vous à indiquer'}`"
    >
      <template #actions>
        <UiStatusTag :status="status" />
      </template>
    </UiPageHeader>

    <UiFlowSteps v-if="!['brouillon', 'annulee', 'litige'].includes(status)" :status="status" />

    <!-- Prochaine étape -->
    <div class="mb-6">
      <UiAlertBox v-if="status === 'brouillon'" tone="info">
        Brouillon non publié.
        <NuxtLink :to="`/demandes/${id}/modifier`" class="font-semibold underline">
          Compléter et publier
        </NuxtLink>
      </UiAlertBox>
      <UiAlertBox v-else-if="status === 'publiee'" tone="info">
        Demande publiée : nous étudions votre proposition et revenons vers vous dans la messagerie.
      </UiAlertBox>
      <UiAlertBox
        v-else-if="status === 'en_negociation'"
        :tone="pendingOffer?.author_side === 'checkmyflat' ? 'warning' : 'info'"
      >
        {{
          pendingOffer?.author_side === 'checkmyflat'
            ? 'Nous vous avons fait une proposition : acceptez-la, contre-proposez ou écrivez-nous.'
            : 'Votre proposition est en attente de notre réponse.'
        }}
      </UiAlertBox>
      <div v-else-if="status === 'acceptee'" class="card flex flex-wrap items-center gap-4 p-5">
        <UiIcon :icon="CreditCard" :size="24" class="text-brand-dark" />
        <div class="min-w-[220px] flex-1">
          <p class="font-semibold">Prix accepté : {{ formatEuros(total ?? 0) }}</p>
          <p class="text-sm text-muted">
            <template v-if="paymentOpen">
              Réglez pour confirmer la visite. Le débit a lieu après la visite.
            </template>
            <template v-else-if="slot">
              Le paiement ouvrira le {{ formatDay(paymentOpensAt(slot)) }}, 7 jours avant le rendez-vous. Nous
              vous préviendrons par email.
            </template>
          </p>
        </div>
        <NuxtLink v-if="paymentOpen" :to="`/demandes/${id}/paiement`" class="btn btn-primary">
          Payer {{ formatEuros(total ?? 0) }}
        </NuxtLink>
      </div>
      <UiAlertBox v-else-if="status === 'payee'" tone="success">
        Paiement confirmé. Nous assignons un visiteur ; vous serez prévenu par email.
      </UiAlertBox>
      <UiAlertBox v-else-if="status === 'planifiee'" tone="success">
        Un visiteur est assigné et se rendra au rendez-vous le {{ slot ? formatSlot(slot) : '' }}.
      </UiAlertBox>
      <UiAlertBox v-else-if="status === 'realisee'" tone="success">
        La visite a eu lieu. Votre rapport est en cours de préparation et vous parviendra sous 24 h.
      </UiAlertBox>
      <div v-else-if="status === 'rapport_livre'" class="card flex flex-wrap items-center gap-4 p-5">
        <UiIcon :icon="FileText" :size="24" class="text-brand-dark" />
        <p class="flex-1 font-semibold">Votre rapport de visite est disponible.</p>
        <NuxtLink :to="`/rapports/${id}`" class="btn btn-primary">Lire le rapport</NuxtLink>
      </div>
      <UiAlertBox v-else-if="status === 'annulee'" tone="warning">
        Demande annulée{{ cancelReason ? ` : ${cancelReason}` : '' }}.
        <template v-if="refund">{{ ` ${refund}` }}</template>
      </UiAlertBox>
      <UiAlertBox v-else-if="status === 'litige'" tone="error">
        Litige en cours{{ cancelReason ? ` : ${cancelReason}` : '' }}. Notre équipe revient vers vous.
      </UiAlertBox>
    </div>

    <div class="grid items-start gap-5 lg:grid-cols-[1.35fr_.85fr]">
      <div>
        <h2 class="sr-only">Messagerie</h2>
        <RequestNegotiationThread
          v-if="status !== 'brouillon'"
          :request-id="id"
          viewer="client"
          :open="negotiationOpen"
          :messages="data.messages"
          :offers="data.offers"
          @changed="refresh"
        />
        <details class="panel mt-5 p-4 text-sm">
          <summary class="cursor-pointer font-semibold">Historique</summary>
          <ol class="mt-3 grid gap-1.5 text-muted">
            <li v-for="e in data.events" :key="e.id">
              <span class="font-mono text-xs">{{ formatDateTimeShort(e.created_at) }}</span>
              · {{ STATUS_LABELS[e.to_status as RequestStatus] }}
              <template v-if="e.reason">— {{ e.reason }}</template>
            </li>
          </ol>
        </details>
      </div>

      <aside class="card p-5">
        <span class="eyebrow">Récapitulatif</span>
        <dl class="mt-3 grid gap-2.5 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-muted">Créneau</dt>
            <dd class="text-right font-semibold">{{ slot ? formatSlot(slot) : '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted">Zone</dt>
            <dd class="text-right font-semibold">{{ request.pricing_zones?.label ?? 'À confirmer' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted">Contact sur place</dt>
            <dd class="text-right font-semibold">{{ request.agency_name ?? '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted">Prix proposé</dt>
            <dd class="font-mono font-semibold">
              {{ request.proposed_price_cents ? formatEuros(request.proposed_price_cents) : '—' }}
            </dd>
          </div>
          <div
            v-if="pendingOffer && pendingOffer.author_side === 'checkmyflat'"
            class="flex justify-between gap-4"
          >
            <dt class="text-muted">Contre-proposition</dt>
            <dd class="font-mono font-semibold">{{ formatEuros(pendingOffer.amount_cents) }}</dd>
          </div>
          <template v-if="request.agreed_price_cents">
            <div class="flex justify-between gap-4">
              <dt class="text-muted">Prix convenu</dt>
              <dd class="font-mono font-semibold">{{ formatEuros(request.agreed_price_cents) }}</dd>
            </div>
            <div v-if="request.urgent_fee_cents" class="flex justify-between gap-4">
              <dt class="text-muted">Supplément 48 h</dt>
              <dd class="font-mono font-semibold">{{ formatEuros(request.urgent_fee_cents) }}</dd>
            </div>
            <div class="flex justify-between gap-4 border-t border-line pt-2.5">
              <dt class="font-semibold">Total</dt>
              <dd class="font-mono font-semibold">{{ formatEuros(total ?? 0) }}</dd>
            </div>
          </template>
        </dl>
        <div v-if="request.priorities" class="mt-4 border-t border-line pt-4 text-sm">
          <p class="eyebrow mb-1.5">À vérifier en priorité</p>
          <p class="whitespace-pre-line">{{ request.priorities }}</p>
        </div>
        <div class="mt-4 grid gap-2 border-t border-line pt-4">
          <NuxtLink v-if="isEditable(status)" :to="`/demandes/${id}/modifier`" class="btn btn-ghost btn-sm">
            <UiIcon :icon="Pencil" :size="16" />
            Modifier la demande
          </NuxtLink>
          <button v-if="canCancel" type="button" class="btn btn-ghost btn-sm" @click="cancelDialog?.open()">
            <UiIcon :icon="XCircle" :size="16" />
            Annuler la demande
          </button>
          <button v-if="canDispute" type="button" class="btn btn-ghost btn-sm" @click="disputeDialog?.open()">
            <UiIcon :icon="TriangleAlert" :size="16" />
            Signaler un problème
          </button>
          <button v-if="canDelete" type="button" class="btn btn-ghost btn-sm" @click="deleteDialog?.open()">
            <UiIcon :icon="Trash2" :size="16" />
            Supprimer
          </button>
        </div>
      </aside>
    </div>

    <UiReasonDialog
      ref="cancelDialog"
      title="Annuler la demande"
      confirm-label="Confirmer l’annulation"
      tone="danger"
      reason-label="Motif"
      reason-required
      :pending="pending"
      :error="actionError"
      @confirm="cancel"
    >
      <p v-if="!paid">Aucun paiement n’a été effectué : l’annulation est sans frais.</p>
      <p v-else-if="cancelPreview?.late">
        Le rendez-vous est dans moins de 24 h : une pénalité de
        <b>{{ formatEuros(cancelPreview.penaltyCents) }}</b>
        s’applique. Montant restitué :
        <b>{{ formatEuros(cancelPreview.refundCents) }}</b>
      </p>
      <p v-else>Vous serez intégralement remboursé.</p>
    </UiReasonDialog>

    <UiReasonDialog
      ref="disputeDialog"
      title="Signaler un problème"
      confirm-label="Ouvrir un litige"
      reason-label="Que s’est-il passé ?"
      reason-required
      :pending="pending"
      :error="actionError"
      @confirm="dispute"
    >
      <p>Notre équipe examinera votre demande et reviendra vers vous par email.</p>
    </UiReasonDialog>

    <UiReasonDialog
      ref="deleteDialog"
      title="Supprimer la demande"
      confirm-label="Supprimer"
      tone="danger"
      :pending="pending"
      :error="actionError"
      @confirm="remove"
    >
      <p v-if="paid || status === 'rapport_livre'">
        Le rapport, les photos et les vidéos seront supprimés définitivement. La trace du paiement est
        conservée pour nos obligations comptables.
      </p>
      <p v-else>La demande et ses messages seront supprimés définitivement.</p>
    </UiReasonDialog>
  </div>
</template>
