<script setup lang="ts">
import { formatScore } from '#shared/domain/scoring'

defineProps<{ score: number }>()
</script>

<template>
  <div
    class="grid h-[74px] w-[74px] shrink-0 -rotate-[7deg] place-content-center rounded-full border-2 border-brand bg-brand-tint text-center text-brand-dark"
    role="img"
    :aria-label="`Note globale ${formatScore(score)} sur 5`"
  >
    <div class="font-mono text-2xl font-semibold leading-none" aria-hidden="true">
      {{ formatScore(score) }}
    </div>
    <div class="mt-[3px] text-[8.5px] uppercase tracking-[0.1em]" aria-hidden="true">globale</div>
  </div>
</template>
