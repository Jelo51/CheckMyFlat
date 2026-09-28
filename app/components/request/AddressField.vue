<script setup lang="ts">
import { MapPin } from 'lucide-vue-next'

interface Suggestion {
  label: string
  address: string
  postalCode: string
  city: string
  lat: number
  lng: number
}

/**
 * Adresse avec autocomplétion (combobox ARIA). Choisir une suggestion
 * renseigne aussi le code postal, la ville et les coordonnées ; modifier le
 * texte à la main efface les coordonnées (la zone sera recalculée côté
 * serveur par géocodage).
 */
const address = defineModel<string>('address', { required: true })
const postalCode = defineModel<string>('postalCode', { required: true })
const city = defineModel<string>('city', { required: true })
const lat = defineModel<number | null>('lat', { required: true })
const lng = defineModel<number | null>('lng', { required: true })

defineProps<{ id: string; describedBy?: string; invalid?: boolean }>()

const suggestions = ref<Suggestion[]>([])
const open = ref(false)
const active = ref(-1)
let timer: ReturnType<typeof setTimeout> | undefined
let lastQuery = ''

function onInput(event: Event) {
  address.value = (event.target as HTMLInputElement).value
  lat.value = null
  lng.value = null
  clearTimeout(timer)
  timer = setTimeout(search, 250)
}

async function search() {
  const q = [address.value, postalCode.value, city.value].filter(Boolean).join(' ').trim()
  if (q.length < 5 || q === lastQuery) return
  lastQuery = q
  try {
    suggestions.value = await api<Suggestion[]>('/api/geocode', { query: { q } })
  } catch {
    suggestions.value = []
  }
  active.value = -1
  open.value = suggestions.value.length > 0
}

function choose(s: Suggestion) {
  address.value = s.address
  postalCode.value = s.postalCode
  city.value = s.city
  lat.value = s.lat
  lng.value = s.lng
  lastQuery = s.label
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % suggestions.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + suggestions.value.length) % suggestions.value.length
  } else if (event.key === 'Enter' && active.value >= 0) {
    event.preventDefault()
    choose(suggestions.value[active.value]!)
  } else if (event.key === 'Escape') {
    open.value = false
  }
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="relative">
    <input
      :id="id"
      :value="address"
      type="text"
      class="input"
      autocomplete="street-address"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="`${id}-list`"
      :aria-activedescendant="active >= 0 ? `${id}-opt-${active}` : undefined"
      :aria-describedby="describedBy"
      :aria-invalid="invalid"
      @input="onInput"
      @keydown="onKeydown"
      @blur="open = false"
    />
    <ul
      v-show="open"
      :id="`${id}-list`"
      role="listbox"
      class="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-md border border-line bg-white shadow-card"
    >
      <li
        v-for="(s, i) in suggestions"
        :id="`${id}-opt-${i}`"
        :key="s.label"
        role="option"
        :aria-selected="i === active"
        class="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm"
        :class="i === active ? 'bg-brand-tint' : 'hover:bg-surface'"
        @mousedown.prevent="choose(s)"
      >
        <UiIcon :icon="MapPin" :size="16" class="text-muted" />
        {{ s.label }}
      </li>
    </ul>
  </div>
</template>
