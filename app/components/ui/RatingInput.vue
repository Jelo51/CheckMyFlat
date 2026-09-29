<script setup lang="ts">
/**
 * Sélecteur de note 1 à 5 : groupe de boutons radio accessible au clavier,
 * utilisable au pouce sur mobile. Le chiffre reste affiché quelle que soit la
 * couleur (texte encre sur 2-5, blanc sur 1 pour le contraste AA).
 */
const model = defineModel<number | null>({ required: true })
const props = withDefaults(defineProps<{ label: string; name: string; disabled?: boolean }>(), {
  disabled: false,
})

const fills = ['', 'bg-score-1 text-white', 'bg-score-2', 'bg-score-3', 'bg-score-4', 'bg-score-5'] as const

function onKey(event: KeyboardEvent, value: number) {
  const next =
    event.key === 'ArrowRight' || event.key === 'ArrowUp'
      ? Math.min(5, value + 1)
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? Math.max(1, value - 1)
        : null
  if (next === null) return
  event.preventDefault()
  model.value = next
  const group = (event.currentTarget as HTMLElement).parentElement
  group?.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus()
}
</script>

<template>
  <div role="radiogroup" :aria-label="props.label" class="flex gap-[5px]">
    <button
      v-for="value in 5"
      :key="value"
      type="button"
      role="radio"
      :name="name"
      :data-value="value"
      :aria-checked="model === value"
      :aria-label="`${value} sur 5`"
      :tabindex="model === value || (model == null && value === 1) ? 0 : -1"
      :disabled="disabled"
      class="h-11 w-11 rounded-[7px] border font-mono text-[14px] font-semibold transition-colors sm:h-[34px] sm:w-[38px]"
      :class="
        model === value
          ? ['border-ink text-ink', fills[value]]
          : 'border-line-strong bg-white text-muted hover:border-ink'
      "
      @click="model = value"
      @keydown="onKey($event, value)"
    >
      {{ value }}
    </button>
  </div>
</template>
