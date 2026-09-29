<script setup lang="ts">
import { ChevronDown, LogOut, UserRound } from 'lucide-vue-next'
import { ROLE_LABELS } from '#shared/schemas/account'

const { profile, role } = useProfile()
const supabase = useSupabaseClient()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

async function signOut() {
  await supabase.auth.signOut()
  useState('profile').value = null
  useState('profile-loaded-for').value = null
  await navigateTo('/')
}

function onDocumentClick(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))

const route = useRoute()
watch(
  () => route.fullPath,
  () => (open.value = false),
)
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      :aria-expanded="open"
      aria-haspopup="menu"
      aria-controls="account-menu"
      @click="open = !open"
    >
      <UiIcon :icon="UserRound" :size="16" />
      <span class="max-w-[14ch] truncate">{{ profile?.full_name || 'Mon compte' }}</span>
      <UiIcon :icon="ChevronDown" :size="16" />
    </button>
    <div
      v-show="open"
      id="account-menu"
      role="menu"
      class="absolute right-0 z-50 mt-2 w-60 rounded-md border border-line bg-white p-1.5 shadow-card"
    >
      <div class="px-3 py-2 text-xs text-muted">
        <div class="truncate font-semibold text-ink">{{ profile?.email }}</div>
        <div v-if="role">{{ ROLE_LABELS[role] }}</div>
      </div>
      <NuxtLink role="menuitem" to="/compte" class="block rounded-[6px] px-3 py-2 text-sm hover:bg-surface">
        Mon compte
      </NuxtLink>
      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-sm hover:bg-surface"
        @click="signOut"
      >
        <UiIcon :icon="LogOut" :size="16" />
        Se déconnecter
      </button>
    </div>
  </div>
</template>
