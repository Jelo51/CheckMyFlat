<script setup lang="ts">
const nav = [
  { to: '/#comment', label: 'Comment ça marche' },
  { to: '/#tarifs', label: 'Tarifs' },
  { to: '/#faq', label: 'FAQ' },
]
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader :nav="nav" />
    <main id="contenu" class="flex-1" tabindex="-1">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
