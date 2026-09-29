<template>
  <footer class="border-t border-line py-8 text-[13px] text-muted">
    <div class="wrap flex flex-wrap justify-between gap-4">
      <span>© {{ new Date().getFullYear() }} CheckMyFlat</span>
      <nav aria-label="Liens légaux" class="flex flex-wrap gap-x-5 gap-y-2">
        <NuxtLink to="/legal/mentions-legales" class="hover:text-ink">Mentions légales</NuxtLink>
        <NuxtLink to="/legal/cgu-cgv" class="hover:text-ink">Conditions générales</NuxtLink>
        <NuxtLink to="/legal/confidentialite" class="hover:text-ink">Confidentialité</NuxtLink>
      </nav>
    </div>
  </footer>
</template>
