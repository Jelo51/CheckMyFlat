<script setup lang="ts">
import { LogIn, User } from 'lucide-vue-next'

export interface NavItem {
  to: string
  label: string
}

const props = withDefaults(defineProps<{ nav?: NavItem[] }>(), { nav: () => [] })

const user = useSupabaseUser()
const route = useRoute()

/** Entrée active : le plus long lien qui préfixe la page courante (les ancres ne sont jamais actives). */
const activeTo = computed(() => {
  const path = route.path
  return (
    props.nav
      .filter((item) => !item.to.includes('#') && (path === item.to || path.startsWith(`${item.to}/`)))
      .sort((a, b) => b.to.length - a.to.length)[0]?.to ?? null
  )
})
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-line bg-surface/90 backdrop-blur">
    <div class="wrap flex items-center gap-5 py-3">
      <UiLogo />
      <nav v-if="nav.length" aria-label="Navigation principale" class="hidden gap-1 md:flex">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="rounded-[7px] px-3 py-1.5 text-sm font-semibold hover:text-ink"
          :class="activeTo === item.to ? 'text-ink' : 'text-muted'"
          :aria-current="activeTo === item.to ? 'page' : undefined"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
      <div class="flex-1" />
      <slot name="account">
        <NuxtLink v-if="user" to="/espace" class="btn btn-ghost btn-sm">
          <UiIcon :icon="User" :size="16" />
          Mon espace
        </NuxtLink>
        <NuxtLink v-else to="/connexion" class="btn btn-ghost btn-sm">
          <UiIcon :icon="LogIn" :size="16" />
          Se connecter
        </NuxtLink>
      </slot>
    </div>
    <nav
      v-if="nav.length"
      aria-label="Navigation principale (mobile)"
      class="wrap flex gap-1 overflow-x-auto pb-2 md:hidden"
    >
      <NuxtLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="whitespace-nowrap rounded-[7px] px-3 py-1.5 text-sm font-semibold"
        :class="activeTo === item.to ? 'bg-white text-ink' : 'text-muted'"
        :aria-current="activeTo === item.to ? 'page' : undefined"
      >
        {{ item.label }}
      </NuxtLink>
    </nav>
  </header>
</template>
