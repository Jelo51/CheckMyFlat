<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const title = computed(() =>
  props.error.statusCode === 404
    ? 'Page introuvable'
    : props.error.statusCode === 403
      ? 'Accès refusé'
      : 'Une erreur est survenue',
)
useSeoMeta({ title })
</script>

<template>
  <NuxtLayout>
    <div class="wrap flex flex-col items-start gap-4 py-20">
      <span class="eyebrow">Erreur {{ error.statusCode }}</span>
      <h1 class="text-4xl">{{ title }}</h1>
      <p class="max-w-[50ch] text-muted">
        <template v-if="error.statusCode === 404">Cette page n’existe pas ou a été déplacée.</template>
        <template v-else>Réessayez dans un instant. Si le problème persiste, contactez-nous.</template>
      </p>
      <button type="button" class="btn btn-primary" @click="clearError({ redirect: '/' })">
        Retour à l’accueil
      </button>
    </div>
  </NuxtLayout>
</template>
