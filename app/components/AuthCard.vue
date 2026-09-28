<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="wrap flex justify-center py-12 sm:py-16">
    <div class="card w-full max-w-[440px] p-6 sm:p-8">
      <h1 class="text-[26px]">{{ title }}</h1>
      <p v-if="subtitle" class="mt-2 text-sm text-muted">{{ subtitle }}</p>
      <div class="mt-6">
        <slot />
      </div>
      <div v-if="$slots.footer" class="mt-6 border-t border-line pt-5 text-sm text-muted">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
