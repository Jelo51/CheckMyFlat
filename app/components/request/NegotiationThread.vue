<script setup lang="ts">
import { Send, Tag } from 'lucide-vue-next'
import { formatEuros } from '#shared/domain/pricing'
import { formatDateTimeShort } from '#shared/utils/time'
import { offerSchema, messageSchema } from '#shared/schemas/request'
import type { Tables } from '~/types/database.types'

/**
 * Fil de négociation : messages libres et propositions de prix structurées
 * (montant, validité, accepter / refuser / contre-proposer). Partagé entre
 * l'espace client (`client`) et l'admin (`checkmyflat`).
 */
const props = defineProps<{
  requestId: string
  viewer: 'client' | 'checkmyflat'
  open: boolean
  messages: Tables<'messages'>[]
  offers: Tables<'price_offers'>[]
}>()
const emit = defineEmits<{ changed: [] }>()

const offersById = computed(() => new Map(props.offers.map((o) => [o.id, o])))
const now = ref(Date.now())
onMounted(() => {
  const t = setInterval(() => (now.value = Date.now()), 30_000)
  onBeforeUnmount(() => clearInterval(t))
})

function who(side: string) {
  if (side === 'system') return 'CheckMyFlat · info'
  if (side === props.viewer) return 'Vous'
  return side === 'client' ? 'Client' : 'CheckMyFlat'
}

function offerState(offer: Tables<'price_offers'>) {
  if (offer.status === 'pending' && new Date(offer.expires_at).getTime() <= now.value) return 'expired'
  return offer.status
}

const OFFER_STATE_LABELS: Record<string, string> = {
  pending: 'En attente de réponse',
  accepted: 'Acceptée',
  rejected: 'Refusée',
  superseded: 'Remplacée',
  expired: 'Expirée',
}

const pending = ref(false)
const error = ref<string | null>(null)

async function run(fn: () => Promise<unknown>) {
  pending.value = true
  error.value = null
  try {
    await fn()
    emit('changed')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    pending.value = false
  }
}

const respond = (offerId: string, accept: boolean) =>
  run(() => api(`/api/offers/${offerId}/respond`, { method: 'POST', body: { accept } }))

// Composer : message ou contre-proposition
const mode = ref<'message' | 'offer'>('message')
const body = ref('')
const amount = ref('')
const note = ref('')

async function send() {
  if (mode.value === 'message') {
    const parsed = messageSchema.safeParse({ body: body.value })
    if (!parsed.success) {
      error.value = parsed.error.issues[0]?.message ?? 'Message invalide'
      return
    }
    await run(() => api(`/api/requests/${props.requestId}/messages`, { method: 'POST', body: parsed.data }))
    if (!error.value) body.value = ''
  } else {
    const parsed = offerSchema.safeParse({
      amountCents: eurosToCents(amount.value),
      note: note.value || null,
    })
    if (!parsed.success) {
      error.value = parsed.error.issues[0]?.message ?? 'Montant invalide'
      return
    }
    await run(() => api(`/api/requests/${props.requestId}/offers`, { method: 'POST', body: parsed.data }))
    if (!error.value) {
      amount.value = ''
      note.value = ''
      mode.value = 'message'
    }
  }
}

function counter() {
  mode.value = 'offer'
  nextTick(() => document.getElementById(`amount-${props.requestId}`)?.focus())
}

const list = ref<HTMLElement | null>(null)
watch(
  () => props.messages.length,
  () => nextTick(() => list.value?.scrollTo({ top: list.value.scrollHeight })),
)
onMounted(() => list.value?.scrollTo({ top: list.value.scrollHeight }))
</script>

<template>
  <div class="card overflow-hidden">
    <ol
      ref="list"
      class="grid max-h-[480px] gap-3 overflow-y-auto p-[18px]"
      aria-label="Messages"
      aria-live="polite"
    >
      <li v-if="!messages.length" class="text-sm text-muted">Aucun message pour l’instant.</li>
      <li
        v-for="m in messages"
        :key="m.id"
        class="flex"
        :class="m.author_side === viewer ? 'justify-end' : ''"
      >
        <!-- Proposition de prix -->
        <div
          v-if="m.offer_id && offersById.get(m.offer_id)"
          class="max-w-[85%] rounded-[12px] border border-line-strong bg-white p-3.5 sm:max-w-[78%]"
        >
          <div class="eyebrow">
            {{ m.author_side === viewer ? 'Votre proposition' : 'Proposition' }} · {{ who(m.author_side) }}
          </div>
          <div class="mt-1 font-mono text-[22px] font-semibold">
            {{ formatEuros(offersById.get(m.offer_id)!.amount_cents) }}
          </div>
          <p v-if="m.body" class="mt-1 text-sm">{{ m.body }}</p>
          <p class="mt-1.5 text-xs text-muted">
            {{ formatDateTimeShort(m.created_at) }} ·
            <span
              :class="{
                'font-semibold text-brand-dark': offerState(offersById.get(m.offer_id)!) === 'accepted',
              }"
            >
              {{ OFFER_STATE_LABELS[offerState(offersById.get(m.offer_id)!)] }}
            </span>
            <template v-if="offerState(offersById.get(m.offer_id)!) === 'pending'">
              · valable jusqu’au {{ formatDateTimeShort(offersById.get(m.offer_id)!.expires_at) }}
            </template>
          </p>
          <div
            v-if="open && m.author_side !== viewer && offerState(offersById.get(m.offer_id)!) === 'pending'"
            class="mt-3 flex flex-wrap gap-2"
          >
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="pending"
              @click="respond(m.offer_id, true)"
            >
              Accepter {{ formatEuros(offersById.get(m.offer_id)!.amount_cents) }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" :disabled="pending" @click="counter">
              Contre-proposer
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="pending"
              @click="respond(m.offer_id, false)"
            >
              Refuser
            </button>
          </div>
        </div>
        <!-- Message système -->
        <p
          v-else-if="m.author_side === 'system'"
          class="mx-auto rounded-full bg-surface px-3 py-1 text-xs text-muted"
        >
          {{ m.body }} · {{ formatDateTimeShort(m.created_at) }}
        </p>
        <!-- Message libre -->
        <div
          v-else
          class="max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-[14.5px] sm:max-w-[78%]"
          :class="
            m.author_side === viewer
              ? 'rounded-br-[4px] bg-brand text-white'
              : 'rounded-bl-[4px] bg-[#F1F3EF]'
          "
        >
          <div class="mb-1 font-mono text-[10.5px] uppercase tracking-[0.08em] opacity-75">
            {{ who(m.author_side) }} · {{ formatDateTimeShort(m.created_at) }}
          </div>
          <p class="whitespace-pre-line">{{ m.body }}</p>
        </div>
      </li>
    </ol>

    <form v-if="open" class="border-t border-line p-3" novalidate @submit.prevent="send">
      <div class="mb-2 flex gap-1" role="tablist" aria-label="Type d’envoi">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'message'"
          class="rounded-[7px] px-3 py-1 text-[13px] font-semibold"
          :class="mode === 'message' ? 'bg-ink text-white' : 'text-muted'"
          @click="mode = 'message'"
        >
          Message
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'offer'"
          class="rounded-[7px] px-3 py-1 text-[13px] font-semibold"
          :class="mode === 'offer' ? 'bg-ink text-white' : 'text-muted'"
          @click="mode = 'offer'"
        >
          Proposer un prix
        </button>
      </div>
      <div v-if="mode === 'message'" class="flex items-end gap-2.5">
        <label :for="`msg-${requestId}`" class="sr-only">Message</label>
        <textarea
          :id="`msg-${requestId}`"
          v-model="body"
          rows="1"
          class="input min-h-[44px] flex-1"
          placeholder="Écrire un message"
          @keydown.enter.exact.prevent="send"
        />
        <button type="submit" class="btn btn-ink btn-sm h-[44px]" :disabled="pending">
          <UiIcon :icon="Send" :size="16" />
          Envoyer
        </button>
      </div>
      <div v-else class="grid gap-2.5 sm:grid-cols-[140px_1fr_auto] sm:items-end">
        <div>
          <label :for="`amount-${requestId}`" class="field-label">Montant (€)</label>
          <input
            :id="`amount-${requestId}`"
            v-model="amount"
            class="input font-mono"
            inputmode="decimal"
            placeholder="15"
          />
        </div>
        <div>
          <label :for="`note-${requestId}`" class="field-label">Justification (facultatif)</label>
          <input :id="`note-${requestId}`" v-model="note" class="input" maxlength="300" />
        </div>
        <button type="submit" class="btn btn-primary btn-sm h-[44px]" :disabled="pending">
          <UiIcon :icon="Tag" :size="16" />
          Proposer
        </button>
      </div>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    </form>
    <p v-else class="border-t border-line px-4 py-3 text-sm text-muted">La négociation est close.</p>
  </div>
</template>
