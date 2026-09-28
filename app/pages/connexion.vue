<script setup lang="ts">
import { LogIn } from 'lucide-vue-next'
import { signInSchema } from '#shared/schemas/account'

definePageMeta({ guestOnly: true })
useSeoMeta({ title: 'Connexion' })

const route = useRoute()
const supabase = useSupabaseClient()
const afterAuth = useAfterAuth()
const { errors, formError, validate } = useFormErrors()

const form = reactive({ email: '', password: '' })
const pending = ref(false)

async function submit() {
  const data = validate(signInSchema, form)
  if (!data) return
  pending.value = true
  const { error } = await supabase.auth.signInWithPassword(data)
  if (error) {
    formError.value = authErrorMessage(error)
    pending.value = false
    return
  }
  await afterAuth(route.query.next)
}
</script>

<template>
  <AuthCard title="Connexion" subtitle="Accédez à vos demandes et à vos rapports.">
    <UiAlertBox v-if="route.query.suspendu" tone="error" class="mb-4">Ce compte est suspendu.</UiAlertBox>
    <UiAlertBox v-if="route.query.reinitialise" tone="success" class="mb-4">
      Mot de passe modifié. Vous pouvez vous connecter.
    </UiAlertBox>
    <form novalidate @submit.prevent="submit">
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
      <UiFormField v-slot="{ id, describedBy, invalid }" label="Mot de passe" :error="errors.password">
        <input
          :id="id"
          v-model="form.password"
          type="password"
          class="input"
          autocomplete="current-password"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </UiFormField>
      <UiAlertBox v-if="formError" tone="error" class="mb-4">{{ formError }}</UiAlertBox>
      <button type="submit" class="btn btn-primary w-full" :disabled="pending">
        <UiIcon :icon="LogIn" :size="18" />
        Se connecter
      </button>
      <p class="mt-4 text-center text-sm">
        <NuxtLink to="/mot-de-passe-oublie" class="text-brand-dark underline">Mot de passe oublié ?</NuxtLink>
      </p>
    </form>
    <template #footer>
      Pas encore de compte ?
      <NuxtLink
        :to="{ path: '/inscription', query: route.query }"
        class="font-semibold text-brand-dark underline"
      >
        Créer un compte
      </NuxtLink>
    </template>
  </AuthCard>
</template>
