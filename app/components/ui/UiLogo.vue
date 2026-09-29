<script setup lang="ts">
import { Check } from 'lucide-vue-next'

withDefaults(defineProps<{ to?: string }>(), { to: '/' })
</script>

<template>
  <NuxtLink
    :to="to"
    class="flex items-center gap-[9px] font-display text-[19px] font-extrabold tracking-[-0.04em] no-underline"
  >
    <span
      class="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-brand text-white"
      aria-hidden="true"
    >
      <Check :size="15" :stroke-width="3.2" />
    </span>
    CheckMyFlat
  </NuxtLink>
</template>
