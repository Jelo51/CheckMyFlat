<script setup lang="ts">
useSeoMeta({ title: 'Confirmation' })

const route = useRoute()
const user = useSupabaseUser()
const afterAuth = useAfterAuth()
const failed = ref(false)

// Le client Supabase échange le code du lien (PKCE) contre une session au
// chargement ; on attend que l'utilisateur apparaisse.
onMounted(() => {
  if (route.query.error_description) {
    failed.value = true
    return
  }
  const timeout = setTimeout(() => (failed.value = true), 10_000)
  watch(
    user,
    async (value) => {
      if (!value) return
      clearTimeout(timeout)
      await afterAuth(route.query.next)
    },
    { immediate: true },
  )
})
</script>

<template>
  <AuthCard v-if="failed" title="Lien invalide ou expiré">
    <p class="text-sm">
      Le lien de confirmation n’est plus valable. Connectez-vous pour en recevoir un nouveau.
    </p>
    <NuxtLink to="/connexion" class="btn btn-primary mt-5 w-full">Se connecter</NuxtLink>
  </AuthCard>
  <AuthCard v-else title="Confirmation en cours">
    <p class="text-sm text-muted" role="status">Activation de votre compte…</p>
  </AuthCard>
</template>
