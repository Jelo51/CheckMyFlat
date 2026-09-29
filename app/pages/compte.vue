<script setup lang="ts">
import { profileSchema, resetPasswordSchema } from '#shared/schemas/account'

definePageMeta({ layout: 'app', auth: true })
useSeoMeta({ title: 'Mon compte' })

const supabase = useSupabaseClient()
const { profile, refresh } = useProfile()

const info = reactive({ fullName: profile.value?.full_name ?? '', phone: profile.value?.phone ?? '' })
const infoState = useFormErrors()
const infoSaved = ref(false)

async function saveInfo() {
  infoSaved.value = false
  const data = infoState.validate(profileSchema, { fullName: info.fullName, phone: info.phone || null })
  if (!data || !profile.value) return
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: data.fullName, phone: data.phone ?? null })
    .eq('id', profile.value.id)
  if (error) {
    infoState.formError.value = 'Enregistrement impossible. Réessayez.'
    return
  }
  await refresh()
  infoSaved.value = true
}

const password = reactive({ password: '' })
const passwordState = useFormErrors()
const passwordSaved = ref(false)

async function savePassword() {
  passwordSaved.value = false
  const data = passwordState.validate(resetPasswordSchema, password)
  if (!data) return
  const { error } = await supabase.auth.updateUser({ password: data.password })
  if (error) {
    passwordState.formError.value = authErrorMessage(error)
    return
  }
  password.password = ''
  passwordSaved.value = true
}
</script>

<template>
  <div class="mx-auto max-w-[560px]">
    <UiPageHeader title="Mon compte" :subtitle="profile?.email" />

    <form class="card mb-6 p-6" novalidate @submit.prevent="saveInfo">
      <h2 class="mb-4 text-lg">Coordonnées</h2>
      <UiFormField
        v-slot="{ id, describedBy, invalid }"
        label="Nom et prénom"
        :error="infoState.errors.value.fullName"
      >
        <input
          :id="id"
          v-model="info.fullName"
          class="input"
          autocomplete="name"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </UiFormField>
      <UiFormField
        v-slot="{ id, describedBy, invalid }"
        label="Téléphone"
        hint="Facultatif. Utile si nous devons vous joindre le jour de la visite."
        :error="infoState.errors.value.phone"
      >
        <input
          :id="id"
          v-model="info.phone"
          type="tel"
          class="input"
          autocomplete="tel"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </UiFormField>
      <UiAlertBox v-if="infoState.formError.value" tone="error" class="mb-4">
        {{ infoState.formError.value }}
      </UiAlertBox>
      <UiAlertBox v-if="infoSaved" tone="success" class="mb-4">Coordonnées enregistrées.</UiAlertBox>
      <button type="submit" class="btn btn-primary">Enregistrer</button>
    </form>

    <form class="card p-6" novalidate @submit.prevent="savePassword">
      <h2 class="mb-4 text-lg">Mot de passe</h2>
      <UiFormField
        v-slot="{ id, describedBy, invalid }"
        label="Nouveau mot de passe"
        hint="8 caractères minimum."
        :error="passwordState.errors.value.password"
      >
        <input
          :id="id"
          v-model="password.password"
          type="password"
          class="input"
          autocomplete="new-password"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </UiFormField>
      <UiAlertBox v-if="passwordState.formError.value" tone="error" class="mb-4">
        {{ passwordState.formError.value }}
      </UiAlertBox>
      <UiAlertBox v-if="passwordSaved" tone="success" class="mb-4">Mot de passe modifié.</UiAlertBox>
      <button type="submit" class="btn btn-ghost">Changer le mot de passe</button>
    </form>
  </div>
</template>
