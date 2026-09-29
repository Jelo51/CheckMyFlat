<script setup lang="ts">
import { forgotPasswordSchema } from '#shared/schemas/account'

definePageMeta({ guestOnly: true })
useSeoMeta({ title: 'Mot de passe oublié' })

const supabase = useSupabaseClient()
const siteUrl = useRuntimeConfig().public.siteUrl
const { errors, formError, validate } = useFormErrors()

const form = reactive({ email: '' })
const pending = ref(false)
const sent = ref(false)

async function submit() {
  const data = validate(forgotPasswordSchema, form)
  if (!data) return
  pending.value = true
  const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
    redirectTo: `${siteUrl}/nouveau-mot-de-passe`,
  })
  pending.value = false
  // Réponse identique que le compte existe ou non (pas d'énumération).
  if (error && error.code?.startsWith('over_')) {
    formError.value = authErrorMessage(error)
    return
  }
  sent.value = true
}
</script>

<template>
  <AuthCard title="Mot de passe oublié" subtitle="Recevez un lien pour choisir un nouveau mot de passe.">
    <UiAlertBox v-if="sent" tone="success">
      Un email vient d’être envoyé à
      <b>{{ form.email }}</b>
      si un compte y est associé.
    </UiAlertBox>
    <form v-else novalidate @submit.prevent="submit">
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
      <UiAlertBox v-if="formError" tone="error" class="mb-4">{{ formError }}</UiAlertBox>
      <button type="submit" class="btn btn-primary w-full" :disabled="pending">Envoyer le lien</button>
    </form>
    <template #footer>
      <NuxtLink to="/connexion" class="text-brand-dark underline">Retour à la connexion</NuxtLink>
    </template>
  </AuthCard>
</template>
