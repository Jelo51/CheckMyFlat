<script setup lang="ts">
import { ArrowRight, BadgeCheck, CalendarClock, RotateCcw, Save } from 'lucide-vue-next'
import { formatEuros } from '#shared/domain/pricing'
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  requestDraftSchema,
  requestPublishSchema,
} from '#shared/schemas/request'
import { formToDraft, type RequestForm } from '~/utils/requestForm'

/**
 * Formulaire de demande de visite.
 * - `new` : nouvelle demande (visiteur ou client connecté) ;
 * - `draft` : brouillon enregistré ;
 * - `edit` : demande publiée ou en négociation (pas de republication).
 * Le parent réalise les appels réseau.
 */
defineProps<{
  mode: 'new' | 'draft' | 'edit'
  pending?: boolean
  serverError?: string | null
}>()
const form = defineModel<RequestForm>({ required: true })
const emit = defineEmits<{ publish: []; save: [] }>()

const { errors, formError, validate, reset } = useFormErrors()
const { quote } = useQuote(form.value)

const priceCents = computed(() => eurosToCents(form.value.proposedPrice))
const belowFloor = computed(
  () =>
    !!quote.value?.zone &&
    typeof priceCents.value === 'number' &&
    !Number.isNaN(priceCents.value) &&
    priceCents.value < quote.value.zone.basePriceCents,
)

/** Erreurs Zod (chemins API) → champs du formulaire. */
const fieldErrors = computed(() => ({
  listingUrl: errors.value.listingUrl,
  address: errors.value.address,
  postalCode: errors.value.postalCode,
  city: errors.value.city,
  propertyType: errors.value.propertyType,
  slot: errors.value.slotAt,
  agencyName: errors.value.agencyName,
  agencyPhone: errors.value.agencyPhone,
  agencyEmail: errors.value.agencyEmail,
  priorities: errors.value.priorities,
  price: errors.value.proposedPriceCents,
  consent: errors.value.consent,
}))

function onPublish() {
  const payload = { ...formToDraft(form.value), consent: form.value.consent || undefined }
  if (validate(requestPublishSchema(), payload)) emit('publish')
}

function onSave() {
  if (validate(requestDraftSchema, formToDraft(form.value))) emit('save')
}

function clearForm() {
  reset()
  Object.assign(form.value, emptyRequestForm())
}

const today = new Date().toISOString().slice(0, 10)
</script>

<template>
  <form class="grid items-start gap-5 lg:grid-cols-[1.35fr_.85fr]" novalidate @submit.prevent="onPublish">
    <div class="card p-5 sm:p-6">
      <span class="eyebrow">Le logement</span>
      <div class="h-4" />
      <UiFormField
        v-slot="{ id, describedBy, invalid }"
        label="Lien de l’annonce"
        hint="Facultatif : leboncoin, SeLoger, PAP…"
        :error="fieldErrors.listingUrl"
      >
        <input
          :id="id"
          v-model="form.listingUrl"
          type="url"
          inputmode="url"
          class="input"
          placeholder="https://"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </UiFormField>
      <UiFormField
        v-slot="{ id, describedBy, invalid }"
        label="Adresse"
        required
        :error="fieldErrors.address"
      >
        <RequestAddressField
          :id="id"
          v-model:address="form.address"
          v-model:postal-code="form.postalCode"
          v-model:city="form.city"
          v-model:lat="form.lat"
          v-model:lng="form.lng"
          :described-by="describedBy"
          :invalid="invalid"
        />
      </UiFormField>
      <div class="grid gap-x-3.5 sm:grid-cols-[.6fr_1.4fr]">
        <UiFormField
          v-slot="{ id, describedBy, invalid }"
          label="Code postal"
          required
          :error="fieldErrors.postalCode"
        >
          <input
            :id="id"
            v-model="form.postalCode"
            class="input"
            inputmode="numeric"
            autocomplete="postal-code"
            maxlength="5"
            :aria-describedby="describedBy"
            :aria-invalid="invalid"
            @input="((form.lat = null), (form.lng = null))"
          />
        </UiFormField>
        <UiFormField v-slot="{ id, describedBy, invalid }" label="Ville" required :error="fieldErrors.city">
          <input
            :id="id"
            v-model="form.city"
            class="input"
            autocomplete="address-level2"
            :aria-describedby="describedBy"
            :aria-invalid="invalid"
            @input="((form.lat = null), (form.lng = null))"
          />
        </UiFormField>
      </div>
      <UiFormField
        v-slot="{ id, describedBy, invalid }"
        label="Type de bien"
        required
        :error="fieldErrors.propertyType"
      >
        <select
          :id="id"
          v-model="form.propertyType"
          class="input"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        >
          <option value="" disabled>Choisir</option>
          <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">{{ PROPERTY_TYPE_LABELS[t] }}</option>
        </select>
      </UiFormField>

      <div class="mb-1.5 mt-2 flex items-center gap-2">
        <UiIcon :icon="CalendarClock" :size="18" class="text-muted" />
        <span class="eyebrow">Le rendez-vous</span>
      </div>
      <p class="field-hint mb-3.5 mt-0">
        Indiquez le créneau que vous avez déjà convenu avec l’agence ou le propriétaire.
      </p>
      <div class="grid gap-x-3.5 sm:grid-cols-2">
        <UiFormField v-slot="{ id, describedBy, invalid }" label="Date" required :error="fieldErrors.slot">
          <input
            :id="id"
            v-model="form.slotDate"
            type="date"
            :min="today"
            class="input"
            :aria-describedby="describedBy"
            :aria-invalid="invalid"
          />
        </UiFormField>
        <UiFormField v-slot="{ id, describedBy }" label="Heure" required>
          <input
            :id="id"
            v-model="form.slotTime"
            type="time"
            step="300"
            class="input"
            :aria-describedby="describedBy"
            :aria-invalid="!!fieldErrors.slot"
          />
        </UiFormField>
      </div>
      <div class="grid gap-x-3.5 sm:grid-cols-2">
        <UiFormField
          v-slot="{ id, describedBy, invalid }"
          label="Contact sur place"
          hint="Agence et nom, ou propriétaire"
          required
          :error="fieldErrors.agencyName"
        >
          <input
            :id="id"
            v-model="form.agencyName"
            class="input"
            autocomplete="organization"
            :aria-describedby="describedBy"
            :aria-invalid="invalid"
          />
        </UiFormField>
        <UiFormField
          v-slot="{ id, describedBy, invalid }"
          label="Téléphone du contact"
          required
          :error="fieldErrors.agencyPhone"
        >
          <input
            :id="id"
            v-model="form.agencyPhone"
            type="tel"
            class="input"
            :aria-describedby="describedBy"
            :aria-invalid="invalid"
          />
        </UiFormField>
      </div>
      <UiFormField
        v-slot="{ id, describedBy, invalid }"
        label="Email du contact"
        hint="Facultatif"
        :error="fieldErrors.agencyEmail"
      >
        <input
          :id="id"
          v-model="form.agencyEmail"
          type="email"
          class="input"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </UiFormField>
      <UiFormField
        v-slot="{ id, describedBy, invalid }"
        label="Ce que vous voulez qu’on vérifie en priorité"
        :error="fieldErrors.priorities"
      >
        <textarea
          :id="id"
          v-model="form.priorities"
          class="input"
          rows="3"
          placeholder="Bruit depuis la chambre, état de la salle de bains, débit fibre…"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </UiFormField>

      <div
        v-if="mode !== 'edit'"
        class="mb-4 flex items-start gap-3 rounded-md bg-brand-tint px-4 py-4 text-sm"
      >
        <input
          id="consent"
          v-model="form.consent"
          type="checkbox"
          class="mt-1 h-4 w-4 shrink-0 accent-brand"
          :aria-invalid="!!fieldErrors.consent"
          aria-describedby="consent-error"
        />
        <label for="consent">
          J’atteste avoir prévenu l’agence qu’une personne mandatée visitera à ma place, et j’autorise
          CheckMyFlat à réaliser des prises de vue sous réserve de l’accord obtenu sur place.
        </label>
      </div>
      <p v-if="fieldErrors.consent" id="consent-error" class="field-error -mt-2 mb-4" role="alert">
        {{ fieldErrors.consent }}
      </p>

      <UiAlertBox v-if="serverError || formError" tone="error" class="mb-4">
        {{ serverError || formError }}
      </UiAlertBox>

      <div class="flex flex-wrap gap-2.5">
        <button v-if="mode !== 'edit'" type="submit" class="btn btn-primary" :disabled="pending">
          Proposer ce prix et publier
          <UiIcon :icon="ArrowRight" :size="18" />
        </button>
        <button
          type="button"
          class="btn"
          :class="mode === 'edit' ? 'btn-primary' : 'btn-ghost'"
          :disabled="pending"
          @click="onSave"
        >
          <UiIcon :icon="Save" :size="18" />
          {{ mode === 'edit' ? 'Enregistrer les modifications' : 'Enregistrer le brouillon' }}
        </button>
        <button
          v-if="mode === 'new'"
          type="button"
          class="btn btn-ghost"
          :disabled="pending"
          @click="clearForm"
        >
          <UiIcon :icon="RotateCcw" :size="18" />
          Tout effacer
        </button>
      </div>
    </div>

    <aside class="card p-5 sm:p-6 lg:sticky lg:top-24">
      <span class="eyebrow">Votre proposition</span>
      <div class="h-3.5" />
      <UiFormField
        v-slot="{ id, describedBy, invalid }"
        label="Prix proposé (€)"
        required
        :error="fieldErrors.price"
      >
        <input
          :id="id"
          v-model="form.proposedPrice"
          class="input font-mono"
          inputmode="decimal"
          placeholder="10"
          :disabled="mode === 'edit'"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </UiFormField>
      <p v-if="mode === 'edit'" class="field-hint -mt-2 mb-3">
        Pour changer le prix, faites une proposition dans la messagerie.
      </p>
      <div v-if="quote?.zone" class="mb-3 text-[13px]">
        <p>
          <b>{{ quote.zone.label }}</b>
          : les visites y partent de
          <b class="font-mono">{{ formatEuros(quote.zone.basePriceCents, true) }}</b>
        </p>
        <p v-if="quote.urgentFeeCents" class="mt-1.5">
          Rendez-vous sous 48 h : supplément de
          <b class="font-mono">{{ formatEuros(quote.urgentFeeCents, true) }}</b>
          ajouté au prix convenu.
        </p>
      </div>
      <p v-else-if="form.city" class="field-hint mb-3">
        La zone sera confirmée par notre équipe si l’adresse n’est pas reconnue.
      </p>
      <UiAlertBox v-if="belowFloor" tone="warning" class="mb-3">
        Votre prix est sous le tarif habituel de la zone. Vous pouvez le proposer, mais il risque d’être
        refusé.
      </UiAlertBox>
      <div class="my-3.5 border-t border-line" />
      <ul class="grid gap-2.5 text-[13.5px] text-muted">
        <li class="flex gap-2.5">
          <UiIcon :icon="BadgeCheck" :size="18" class="text-brand-dark" />
          Rien n’est prélevé maintenant.
        </li>
        <li class="flex gap-2.5">
          <UiIcon :icon="BadgeCheck" :size="18" class="text-brand-dark" />
          Le paiement se déclenche quand vous acceptez le prix final.
        </li>
        <li class="flex gap-2.5">
          <UiIcon :icon="BadgeCheck" :size="18" class="text-brand-dark" />
          Visite non réalisée : remboursement automatique.
        </li>
      </ul>
    </aside>
  </form>
</template>
