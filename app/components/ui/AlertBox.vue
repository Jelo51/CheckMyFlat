<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-vue-next'

const props = withDefaults(defineProps<{ tone?: 'info' | 'success' | 'warning' | 'error' }>(), {
  tone: 'info',
})

const styles = {
  info: { icon: Info, cls: 'border-line bg-white text-ink' },
  success: { icon: CircleCheck, cls: 'border-brand bg-brand-tint text-brand-dark' },
  warning: { icon: TriangleAlert, cls: 'border-warn-border bg-warn-tint text-warn' },
  error: { icon: CircleAlert, cls: 'border-danger bg-danger-tint text-danger' },
} as const

const style = computed(() => styles[props.tone])
</script>

<template>
  <div
    class="flex items-start gap-3 rounded-md border px-4 py-3 text-sm"
    :class="style.cls"
    :role="tone === 'error' ? 'alert' : 'status'"
  >
    <UiIcon :icon="style.icon" class="mt-px" />
    <div class="min-w-0 flex-1"><slot /></div>
  </div>
</template>
