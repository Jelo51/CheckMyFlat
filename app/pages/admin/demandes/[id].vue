<script setup lang="ts">
import { ArrowLeft, ExternalLink, FileText, RefreshCw, UserCheck } from 'lucide-vue-next'
import { formatEuros } from '#shared/domain/pricing'
import { STATUS_LABELS, type RequestStatus } from '#shared/domain/stateMachine'
import { formatDateTimeShort, formatSlot } from '#shared/utils/time'
import { PROPERTY_TYPE_LABELS, type PropertyType } from '#shared/schemas/request'

definePageMeta({ layout: 'app', roles: ['admin'] })

const route = useRoute()
const id = String(route.params.id)
const supabase = useSupabaseClient()
const { profile } = useProfile()
const { data, refresh } = useRequestDetail(id)
await refresh()
if (!data.value?.request)
  throw createError({ statusCode: 404, statusMessage: 'Demande introuvable', fatal: true })

const request = computed(() => data.value!.request!)
const status = computed(() => request.value.status as RequestStatus)
useSeoMeta({ title: () => `Admin · ${request.value.reference}` })

const { data: aux } = await useAsyncData(`admin-aux-${id}`, async () => {
  const [client, agents, zones] = await Promise.all([
    supabase.from('profiles').select('full_name, email, phone').eq('id', request.value.user_id).maybeSingle(),
    supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('role', ['agent', 'admin'])
      .is('suspended_at', null)
      .order('full_name'),
    supabase.from('pricing_zones').select('id, label, base_price_cents').order('position'),
  ])
  return { client: client.data, agents: agents.data ?? [], zones: zones.data ?? [] }
})

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Session ouverte',
  authorized: 'Empreinte posée',
  captured: 'Débité',
  partially_refunded: 'Partiellement remboursé',
  refunded: 'Remboursé',
  canceled: 'Annulé / libéré',
  failed: 'Échec',
}
const ACTOR_LABELS: Record<string, string> = {
  owner: 'client',
  admin: 'admin',
  assigned_agent: 'agent',
  system: 'système',
}

const negotiationOpen = computed(() => status.value === 'publiee' || status.value === 'en_negociation')
const canAssign = computed(() => status.value === 'payee' || status.value === 'planifiee')
const canCancel = computed(() =>
  ['brouillon', 'publiee', 'en_negociation', 'acceptee', 'payee', 'planifiee'].includes(status.value),
)
const canDispute = computed(() => status.value === 'realisee' || status.value === 'rapport_livre')
const hasReport = computed(() => ['realisee', 'rapport_livre', 'litige'].includes(status.value))
const refundable = computed(() =>
  data
    .value!.payments.filter((p) => ['captured', 'partially_refunded'].includes(p.status))
    .reduce((sum, p) => sum + p.captured_cents - p.refunded_cents, 0),
)

const agentId = ref(request.value.assigned_agent_id ?? '')
const zoneId = ref(request.value.zone_id ?? '')
const refundAmount = ref('')
const pending = ref<string | null>(null)
const message = ref<{ tone: 'success' | 'error'; text: string } | null>(null)

async function act(key: string, fn: () => Promise<unknown>, success: string) {
  pending.value = key
  message.value = null
  try {
    await fn()
    message.value = { tone: 'success', text: success }
    await refresh()
    await refreshNuxtData(`admin-aux-${id}`)
  } catch (e) {
    message.value = { tone: 'error', text: errorMessage(e) }
  } finally {
    pending.value = null
  }
}

const assign = (agent: string) =>
  act(
    'assign',
    () => api(`/api/admin/requests/${id}/assign`, { method: 'POST', body: { agentId: agent } }),
    'Agent assigné, notifications envoyées.',
  )
const setZone = () =>
  act(
    'zone',
    () => api(`/api/admin/requests/${id}/zone`, { method: 'POST', body: { zoneId: zoneId.value } }),
    'Zone mise à jour.',
  )
const regenerate = () =>
  act('pdf', () => api(`/api/admin/requests/${id}/regenerate`, { method: 'POST' }), 'Rapport PDF régénéré.')
function refund() {
  const cents = eurosToCents(refundAmount.value)
  if (!cents || Number.isNaN(cents) || cents <= 0) {
    message.value = { tone: 'error', text: 'Montant invalide' }
    return
  }
  act(
    'refund',
    () => api(`/api/admin/requests/${id}/refund`, { method: 'POST', body: { amountCents: cents } }),
    `Remboursement de ${formatEuros(cents)} effectué.`,
  ).then(() => (refundAmount.value = ''))
}

const cancelDialog = ref<{ open: () => void; close: () => void } | null>(null)
const disputeDialog = ref<{ open: () => void; close: () => void } | null>(null)
const dialogError = ref<string | null>(null)
async function withDialog(dialog: { close: () => void } | null, url: string, reason: string) {
  pending.value = 'dialog'
  dialogError.value = null
  try {
    await api(url, { method: 'POST', body: { reason } })
    dialog?.close()
    await refresh()
  } catch (e) {
    dialogError.value = errorMessage(e)
  } finally {
    pending.value = null
  }
}
</script>

<template>
  <div v-if="data?.request">
    <NuxtLink to="/admin" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      <UiIcon :icon="ArrowLeft" :size="16" />
      Toutes les demandes
    </NuxtLink>
    <UiPageHeader
      :title="`${request.property_type ? PROPERTY_TYPE_LABELS[request.property_type as PropertyType] : 'Logement'} · ${request.address ?? '—'}, ${request.city ?? ''}`"
      :subtitle="`${request.reference} · ${request.slot_at ? formatSlot(request.slot_at) : 'créneau non renseigné'}`"
    >
      <template #actions>
        <UiStatusTag :status="status" />
      </template>
    </UiPageHeader>
    <UiFlowSteps v-if="!['brouillon', 'annulee', 'litige'].includes(status)" :status="status" />
    <UiAlertBox v-if="message" :tone="message.tone" class="mb-5">{{ message.text }}</UiAlertBox>

    <div class="grid items-start gap-5 lg:grid-cols-[1.25fr_.95fr]">
      <div class="grid gap-5">
        <section aria-labelledby="nego-title">
          <h2 id="nego-title" class="eyebrow mb-2">Négociation</h2>
          <RequestNegotiationThread
            :request-id="id"
            viewer="checkmyflat"
            :open="negotiationOpen"
            :messages="data.messages"
            :offers="data.offers"
            @changed="refresh"
          />
        </section>

        <section class="panel p-4" aria-labelledby="events-title">
          <h2 id="events-title" class="eyebrow mb-3">Journal</h2>
          <ol class="grid gap-1.5 text-sm">
            <li v-for="e in data.events" :key="e.id">
              <span class="font-mono text-xs text-muted">{{ formatDateTimeShort(e.created_at) }}</span>
              ·
              <template v-if="e.from_status && e.from_status !== e.to_status">
                {{ STATUS_LABELS[e.from_status as RequestStatus] }} →
              </template>
              <b>{{ STATUS_LABELS[e.to_status as RequestStatus] }}</b>
              <span class="text-muted">({{ ACTOR_LABELS[e.actor_kind] }})</span>
              <template v-if="e.reason">— {{ e.reason }}</template>
            </li>
          </ol>
        </section>
      </div>

      <div class="grid gap-5">
        <section class="card p-5" aria-labelledby="req-title">
          <h2 id="req-title" class="eyebrow mb-3">Demande</h2>
          <dl class="grid gap-2 text-sm">
            <div class="flex justify-between gap-4">
              <dt class="text-muted">Client</dt>
              <dd class="text-right">
                {{ aux?.client?.full_name }}
                <span class="block text-xs text-muted">
                  {{ aux?.client?.email }} {{ aux?.client?.phone }}
                </span>
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted">Contact sur place</dt>
              <dd class="text-right">
                {{ request.agency_name }}
                <span class="block text-xs text-muted">
                  {{ request.agency_phone }} {{ request.agency_email }}
                </span>
              </dd>
            </div>
            <div v-if="request.listing_url" class="flex justify-between gap-4">
              <dt class="text-muted">Annonce</dt>
              <dd>
                <a
                  :href="request.listing_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 underline"
                >
                  Ouvrir
                  <UiIcon :icon="ExternalLink" :size="14" />
                </a>
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted">Prix proposé</dt>
              <dd class="font-mono">
                {{ request.proposed_price_cents ? formatEuros(request.proposed_price_cents) : '—' }}
              </dd>
            </div>
            <div v-if="request.agreed_price_cents" class="flex justify-between gap-4">
              <dt class="text-muted">Prix convenu (+ 48 h)</dt>
              <dd class="font-mono">
                {{ formatEuros(request.agreed_price_cents) }}
                <template v-if="request.urgent_fee_cents">
                  + {{ formatEuros(request.urgent_fee_cents) }}
                </template>
              </dd>
            </div>
          </dl>
          <p v-if="request.priorities" class="mt-3 rounded-md bg-surface px-3 py-2 text-sm">
            <b>Priorités :</b>
            {{ request.priorities }}
          </p>
        </section>

        <section class="card p-5" aria-labelledby="zone-title">
          <h2 id="zone-title" class="eyebrow mb-3">Zone tarifaire</h2>
          <UiAlertBox v-if="!request.zone_id" tone="warning" class="mb-3">
            Adresse non reconnue : fixez la zone.
          </UiAlertBox>
          <div class="flex gap-2">
            <label for="zone-select" class="sr-only">Zone</label>
            <select id="zone-select" v-model="zoneId" class="input">
              <option value="" disabled>Choisir</option>
              <option v-for="z in aux?.zones" :key="z.id" :value="z.id">
                {{ z.label }} (dès {{ formatEuros(z.base_price_cents, true) }})
              </option>
            </select>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="!zoneId || zoneId === request.zone_id || pending === 'zone'"
              @click="setZone"
            >
              Appliquer
            </button>
          </div>
        </section>

        <section v-if="canAssign" class="card p-5" aria-labelledby="assign-title">
          <h2 id="assign-title" class="eyebrow mb-3">Visiteur</h2>
          <div class="flex gap-2">
            <label for="agent-select" class="sr-only">Agent</label>
            <select id="agent-select" v-model="agentId" class="input">
              <option value="" disabled>Choisir un visiteur</option>
              <option v-for="a in aux?.agents" :key="a.id" :value="a.id">
                {{ a.full_name ?? a.email }}{{ a.role === 'admin' ? ' (admin)' : '' }}
              </option>
            </select>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="!agentId || agentId === request.assigned_agent_id || pending === 'assign'"
              @click="assign(agentId)"
            >
              Assigner
            </button>
          </div>
          <button
            v-if="profile && request.assigned_agent_id !== profile.id"
            type="button"
            class="btn btn-ghost btn-sm mt-2"
            :disabled="pending === 'assign'"
            @click="assign(profile.id)"
          >
            <UiIcon :icon="UserCheck" :size="16" />
            M’assigner cette visite
          </button>
          <NuxtLink
            v-if="status === 'planifiee' && request.assigned_agent_id === profile?.id"
            :to="`/agent/visites/${id}`"
            class="btn btn-primary btn-sm mt-2"
          >
            Remplir le compte rendu
          </NuxtLink>
        </section>

        <section v-if="hasReport" class="card p-5" aria-labelledby="report-title">
          <h2 id="report-title" class="eyebrow mb-3">Rapport</h2>
          <div class="flex flex-wrap gap-2">
            <NuxtLink :to="`/rapports/${id}`" class="btn btn-ghost btn-sm">
              <UiIcon :icon="FileText" :size="16" />
              Voir le rapport
            </NuxtLink>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="pending === 'pdf'"
              @click="regenerate"
            >
              <UiIcon :icon="RefreshCw" :size="16" />
              {{ status === 'realisee' ? 'Générer et livrer le PDF' : 'Régénérer le PDF' }}
            </button>
          </div>
        </section>

        <section v-if="data.payments.length" class="card p-5" aria-labelledby="pay-title">
          <h2 id="pay-title" class="eyebrow mb-3">Paiements</h2>
          <ul class="grid gap-2 text-sm">
            <li v-for="p in data.payments" :key="p.id" class="flex flex-wrap justify-between gap-2">
              <span>
                {{ PAYMENT_LABELS[p.status] }}
                <span class="block font-mono text-xs text-muted">
                  {{ p.stripe_payment_intent_id ?? p.stripe_checkout_session_id }}
                </span>
              </span>
              <span class="text-right font-mono">
                {{ formatEuros(p.amount_cents) }}
                <span v-if="p.captured_cents" class="block text-xs text-muted">
                  débité {{ formatEuros(p.captured_cents) }}
                </span>
                <span v-if="p.refunded_cents" class="block text-xs text-muted">
                  remboursé {{ formatEuros(p.refunded_cents) }}
                </span>
              </span>
            </li>
          </ul>
          <form v-if="refundable > 0" class="mt-4 flex gap-2" @submit.prevent="refund">
            <label for="refund-amount" class="sr-only">Montant à rembourser (€)</label>
            <input
              id="refund-amount"
              v-model="refundAmount"
              class="input font-mono"
              inputmode="decimal"
              :placeholder="`max ${formatEuros(refundable)}`"
            />
            <button type="submit" class="btn btn-ghost btn-sm" :disabled="pending === 'refund'">
              Rembourser
            </button>
          </form>
        </section>

        <section v-if="canCancel || canDispute" class="card grid gap-2 p-5" aria-labelledby="actions-title">
          <h2 id="actions-title" class="eyebrow mb-1">Changer le statut</h2>
          <button v-if="canCancel" type="button" class="btn btn-danger btn-sm" @click="cancelDialog?.open()">
            Annuler la demande
          </button>
          <button v-if="canDispute" type="button" class="btn btn-ghost btn-sm" @click="disputeDialog?.open()">
            Ouvrir un litige
          </button>
        </section>
      </div>
    </div>

    <UiReasonDialog
      ref="cancelDialog"
      title="Annuler la demande"
      confirm-label="Confirmer l’annulation"
      tone="danger"
      reason-label="Motif (communiqué au client)"
      reason-required
      :pending="pending === 'dialog'"
      :error="dialogError"
      @confirm="(r) => withDialog(cancelDialog, `/api/requests/${id}/cancel`, r)"
    >
      <p>Annulation à l’initiative de CheckMyFlat : le client est intégralement remboursé.</p>
    </UiReasonDialog>
    <UiReasonDialog
      ref="disputeDialog"
      title="Ouvrir un litige"
      confirm-label="Ouvrir le litige"
      reason-label="Motif"
      reason-required
      :pending="pending === 'dialog'"
      :error="dialogError"
      @confirm="(r) => withDialog(disputeDialog, `/api/requests/${id}/dispute`, r)"
    />
  </div>
</template>
