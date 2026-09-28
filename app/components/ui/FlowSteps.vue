<script setup lang="ts">
import { HAPPY_PATH, STATUS_LABELS, type RequestStatus } from '#shared/domain/stateMachine'

const props = defineProps<{ status: RequestStatus }>()

const current = computed(() => HAPPY_PATH.indexOf(props.status))
</script>

<template>
  <ol
    class="mb-6 flex items-center overflow-x-auto rounded-full border border-line bg-white p-[5px]"
    aria-label="Avancement de la demande"
  >
    <li
      v-for="(step, i) in HAPPY_PATH"
      :key="step"
      class="whitespace-nowrap rounded-full px-[13px] py-1.5 font-mono text-[12.5px]"
      :class="i === current ? 'bg-brand font-semibold text-white' : i < current ? 'text-ink' : 'text-muted'"
      :aria-current="i === current ? 'step' : undefined"
    >
      {{ STATUS_LABELS[step].toLowerCase() }}
    </li>
  </ol>
</template>
