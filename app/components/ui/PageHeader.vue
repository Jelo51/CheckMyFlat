<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="mb-6 flex flex-wrap items-end gap-4">
    <div class="min-w-0 flex-1">
      <h1 class="text-[27px]">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1.5 text-sm text-muted">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
