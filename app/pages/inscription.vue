<script setup lang="ts">
import { UserPlus } from 'lucide-vue-next'
import { signUpSchema } from '#shared/schemas/account'
import { formToDraft } from '~/utils/requestForm'
import { safeNext } from '#shared/utils/url'

definePageMeta({ guestOnly: true })
useSeoMeta({ title: 'Créer un compte' })

const route = useRoute()
const supabase = useSupabaseClient()
const afterAuth = useAfterAuth()
const localDraft = useLocalDraft()
const siteUrl = useRuntimeConfig().public.siteUrl
const { errors, formError, validate } = useFormErrors()

const form = reactive({ fullName: '', email: '', password: '', acceptTerms: false })
const pending = ref(false)
const awaitingConfirmation = ref(false)
const hasDraft = ref(false)

onMounted(() => {
  hasDraft.value = !!localDraft.read()
})

async function submit() {
  const data = validate(signUpSchema, form)
  if (!data) return
  pending.value = true
  const draft = localDraft.read()
  const next = safeNext(route.query.next) ?? ''
  const { data: result, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      // Le brouillon voyage avec le compte : il est rattaché même si l'email
      // est confirmé depuis un autre appareil.
      data: { full_name: data.fullName, pending_draft: draft ? formToDraft(draft) : null },
      emailRedirectTo: `${siteUrl}/auth/confirmation${next ? `?next=${encodeURIComponent(next)}` : ''}`,
    },
  })
  pending.value = false
  if (error) {
    formError.value = authErrorMessage(error)
    return
  }
  if (result.session) {
    await afterAuth(route.query.next)
  } else {
    awaitingConfirmation.value = true
  }
}
</script>

<template>
  <AuthCard
    v-if="awaitingConfirmation"
    title="Vérifiez vos emails"
    subtitle="Un lien de confirmation vient de vous être envoyé."
  >
    <p class="text-sm">
      Cliquez sur le lien reçu à l’adresse
      <b>{{ form.email }}</b>
      pour activer votre compte.
      <template v-if="hasDraft">Votre demande en cours est conservée et vous attendra.</template>
    </p>
  </AuthCard>
  <AuthCard
    v-else
    title="Créer un compte"
    subtitle="Le compte vous sert à suivre la négociation, payer et recevoir vos rapports."
  >
    <UiAlertBox v-if="hasDraft" tone="success" class="mb-4">
      Votre demande en cours est conservée : vous la retrouverez juste après l’inscription.
    </UiAlertBox>
    <form novalidate @submit.prevent="submit">
      <UiFormField v-slot="{ id, describedBy, invalid }" label="Nom et prénom" :error="errors.fullName">
        <input
          :id="id"
          v-model="form.fullName"
          type="text"
          class="input"
          autocomplete="name"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </UiFormField>
      <UiFormField v-slot="{ id, describedBy, invalid }" label="Email" :error="errors.email">
        <input
          :id="id"
          v-model="form.email"
          type="email"
          class="input"
          autocomplete="email"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </UiFormField>
      <UiFormField
        v-slot="{ id, describedBy, invalid }"
        label="Mot de passe"
        hint="8 caractères minimum."
        :error="errors.password"
      >
        <input
          :id="id"
          v-model="form.password"
          type="password"
          class="input"
          autocomplete="new-password"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </UiFormField>
      <div class="mb-4 flex items-start gap-3 text-sm">
        <input
          id="accept-terms"
          v-model="form.acceptTerms"
          type="checkbox"
          class="mt-1 h-4 w-4 accent-brand"
          :aria-invalid="!!errors.acceptTerms"
        />
        <label for="accept-terms">
          J’accepte les
          <NuxtLink to="/legal/cgu-cgv" target="_blank" class="text-brand-dark underline">
            conditions générales
          </NuxtLink>
          et la
          <NuxtLink to="/legal/confidentialite" target="_blank" class="text-brand-dark underline">
            politique de confidentialité
          </NuxtLink>
        </label>
      </div>
      <p v-if="errors.acceptTerms" class="field-error -mt-2 mb-4" role="alert">{{ errors.acceptTerms }}</p>
      <UiAlertBox v-if="formError" tone="error" class="mb-4">{{ formError }}</UiAlertBox>
      <button type="submit" class="btn btn-primary w-full" :disabled="pending">
        <UiIcon :icon="UserPlus" :size="18" />
        Créer mon compte
      </button>
    </form>
    <template #footer>
      Déjà inscrit ?
      <NuxtLink
        :to="{ path: '/connexion', query: route.query }"
        class="font-semibold text-brand-dark underline"
      >
        Se connecter
      </NuxtLink>
    </template>
  </AuthCard>
</template>
