<script setup lang="ts">
/**
 * Libellé + aide + erreur. Le slot reçoit `id` et `describedBy` à poser sur
 * le contrôle pour que les lecteurs d'écran annoncent l'aide et l'erreur.
 */
const props = defineProps<{ label: string; hint?: string; error?: string | null; required?: boolean }>()

const id = useId()
const describedBy = computed(
  () =>
    [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined,
)
</script>

<template>
  <div class="field">
    <label :for="id" class="field-label">
      {{ label }}
      <span v-if="required" class="text-danger" aria-hidden="true">*</span>
    </label>
    <slot :id="id" :described-by="describedBy" :invalid="!!error" />
    <p v-if="hint" :id="`${id}-hint`" class="field-hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="field-error" role="alert">{{ error }}</p>
  </div>
</template>
