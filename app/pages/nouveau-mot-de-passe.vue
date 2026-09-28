<script setup lang="ts">
import { resetPasswordSchema } from '#shared/schemas/account'

useSeoMeta({ title: 'Nouveau mot de passe' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { errors, formError, validate } = useFormErrors()

const form = reactive({ password: '' })
const pending = ref(false)

async function submit() {
  const data = validate(resetPasswordSchema, form)
  if (!data) return
  pending.value = true
  const { error } = await supabase.auth.updateUser({ password: data.password })
  if (error) {
    pending.value = false
    formError.value = authErrorMessage(error)
    return
  }
  await supabase.auth.signOut()
  await navigateTo({ path: '/connexion', query: { reinitialise: '1' } })
}
</script>

<template>
  <AuthCard title="Nouveau mot de passe">
    <ClientOnly>
      <form v-if="user" novalidate @submit.prevent="submit">
        <UiFormField
          v-slot="{ id, describedBy, invalid }"
          label="Nouveau mot de passe"
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
        <UiAlertBox v-if="formError" tone="error" class="mb-4">{{ formError }}</UiAlertBox>
        <button type="submit" class="btn btn-primary w-full" :disabled="pending">Enregistrer</button>
      </form>
      <div v-else>
        <p class="text-sm">Ce lien n’est plus valable. Demandez-en un nouveau.</p>
        <NuxtLink to="/mot-de-passe-oublie" class="btn btn-primary mt-5 w-full">
          Recevoir un nouveau lien
        </NuxtLink>
      </div>
    </ClientOnly>
  </AuthCard>
</template>
