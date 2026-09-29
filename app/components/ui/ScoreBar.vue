<script setup lang="ts">
/**
 * Barre de 5 segments + chiffre. Le nombre de segments remplis porte
 * l'information : la couleur n'est jamais seule.
 */
const props = defineProps<{ score: number }>()

const rounded = computed(() => Math.min(5, Math.max(1, Math.round(props.score))))
const fill = computed(() => `bg-score-${rounded.value}`)
</script>

<template>
  <span class="flex shrink-0 items-center gap-3.5">
    <span class="flex gap-[3px]" role="img" :aria-label="`Note ${score} sur 5`">
      <i
        v-for="i in 5"
        :key="i"
        class="block h-[9px] w-[15px] rounded-sm"
        :class="i <= rounded ? fill : 'bg-line'"
        aria-hidden="true"
      />
    </span>
    <span class="w-[22px] text-right font-mono text-sm font-semibold" aria-hidden="true">{{ score }}</span>
  </span>
</template>
