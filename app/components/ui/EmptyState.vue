<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{ icon: Component; title: string; text?: string }>()
</script>

<template>
  <div class="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
    <span class="grid h-11 w-11 place-items-center rounded-[10px] bg-brand-tint text-brand-dark">
      <UiIcon :icon="icon" :size="24" />
    </span>
    <h2 class="text-lg">{{ title }}</h2>
    <p v-if="text" class="max-w-[46ch] text-sm text-muted">{{ text }}</p>
    <slot />
  </div>
</template>
