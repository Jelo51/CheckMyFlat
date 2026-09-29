<script setup lang="ts">
import type { AccountRole } from '#shared/schemas/account'

/** Espace connecté : navigation selon le rôle. */
const { role } = useProfile()

const NAV: Record<AccountRole, { to: string; label: string }[]> = {
  user: [
    { to: '/demandes', label: 'Mes demandes' },
    { to: '/demandes/nouvelle', label: 'Nouvelle demande' },
    { to: '/rapports', label: 'Mes rapports' },
  ],
  agent: [{ to: '/agent/visites', label: 'Mes visites' }],
  admin: [
    { to: '/admin', label: 'Demandes' },
    { to: '/agent/visites', label: 'Mes visites' },
    { to: '/admin/utilisateurs', label: 'Utilisateurs' },
    { to: '/admin/tarifs', label: 'Tarifs' },
  ],
}

const nav = computed(() => (role.value ? NAV[role.value] : []))
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader :nav="nav">
      <template #account>
        <AccountMenu />
      </template>
    </AppHeader>
    <main id="contenu" class="flex-1" tabindex="-1">
      <div class="wrap py-8 pb-16">
        <slot />
      </div>
    </main>
    <AppFooter />
  </div>
</template>
