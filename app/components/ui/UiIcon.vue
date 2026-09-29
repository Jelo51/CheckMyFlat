<script setup lang="ts">
import type { Component } from 'vue'

/** Icône Lucide aux réglages de la charte : contour 1,75 px, 20 px par défaut. */
withDefaults(defineProps<{ icon: Component; size?: number; label?: string }>(), {
  size: 20,
  label: undefined,
})
</script>

<template>
  <component
    :is="icon"
    :size="size"
    :stroke-width="1.75"
    :aria-hidden="label ? undefined : 'true'"
    :aria-label="label"
    :role="label ? 'img' : undefined"
    class="shrink-0"
  />
</template>
