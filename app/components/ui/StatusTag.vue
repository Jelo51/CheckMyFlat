<script setup lang="ts">
import { STATUS_LABELS, STATUS_TONES, type RequestStatus } from '#shared/domain/stateMachine'

const props = defineProps<{ status: RequestStatus; label?: string }>()

const toneClass = computed(
  () =>
    ({
      live: 'border-brand bg-brand-tint text-brand-dark',
      wait: 'border-warn-border bg-warn-tint text-warn',
      done: 'border-line-strong bg-white text-muted',
      alert: 'border-danger bg-danger-tint text-danger',
    })[STATUS_TONES[props.status]],
)
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-[9px] py-1 font-mono text-[11.5px] font-medium tracking-[0.03em]"
    :class="toneClass"
  >
    {{ label ?? STATUS_LABELS[status] }}
  </span>
</template>
