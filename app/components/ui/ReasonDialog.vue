<script setup lang="ts">
/**
 * Boîte de dialogue modale native (<dialog>) : focus piégé et touche
 * Échap gérés par le navigateur. Motif facultatif ou obligatoire.
 */
const props = withDefaults(
  defineProps<{
    title: string
    confirmLabel: string
    tone?: 'primary' | 'danger'
    reasonLabel?: string
    reasonRequired?: boolean
    pending?: boolean
    error?: string | null
  }>(),
  { tone: 'primary', reasonLabel: undefined, reasonRequired: false, pending: false, error: null },
)
const emit = defineEmits<{ confirm: [reason: string] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const reason = ref('')
const localError = ref<string | null>(null)
const id = useId()

function open() {
  reason.value = ''
  localError.value = null
  dialog.value?.showModal()
}
function close() {
  dialog.value?.close()
}
function confirm() {
  if (props.reasonRequired && reason.value.trim().length < 3) {
    localError.value = 'Indiquez un motif.'
    return
  }
  emit('confirm', reason.value.trim())
}

defineExpose({ open, close })
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="`${id}-title`"
    class="w-[min(92vw,480px)] rounded-lg border border-line bg-white p-0 text-ink shadow-card backdrop:bg-ink/40"
  >
    <form class="p-6" method="dialog" novalidate @submit.prevent="confirm">
      <h2 :id="`${id}-title`" class="text-xl">{{ title }}</h2>
      <div class="mt-3 text-sm">
        <slot />
      </div>
      <div v-if="reasonLabel" class="mt-4">
        <label :for="`${id}-reason`" class="field-label">{{ reasonLabel }}</label>
        <textarea
          :id="`${id}-reason`"
          v-model="reason"
          class="input"
          rows="3"
          maxlength="500"
          :aria-invalid="!!localError"
        />
      </div>
      <p v-if="localError || error" class="field-error" role="alert">{{ localError || error }}</p>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" class="btn btn-ghost btn-sm" @click="close">Retour</button>
        <button
          type="submit"
          class="btn btn-sm"
          :class="tone === 'danger' ? 'btn-danger' : 'btn-primary'"
          :disabled="pending"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </form>
  </dialog>
</template>
