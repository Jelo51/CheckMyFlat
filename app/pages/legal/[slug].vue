<script setup lang="ts">
/**
 * Pages légales : structure prête. Les textes seront fournis par le client
 * (ticket T1 de docs/PLAN.md) et remplaceront la mention « à venir ».
 */
const PAGES: Record<string, { title: string; sections: string[] }> = {
  'mentions-legales': {
    title: 'Mentions légales',
    sections: [
      'Éditeur du site',
      'Directeur de la publication',
      'Hébergement',
      'Contact',
      'Propriété intellectuelle',
    ],
  },
  'cgu-cgv': {
    title: 'Conditions générales d’utilisation et de vente',
    sections: [
      'Objet',
      'Description du service',
      'Création et gestion du compte',
      'Demande de visite et négociation du prix',
      'Paiement',
      'Annulation et remboursement',
      'Réalisation de la visite et prise de vue',
      'Rapport de visite',
      'Responsabilité',
      'Droit applicable et litiges',
    ],
  },
  confidentialite: {
    title: 'Politique de confidentialité',
    sections: [
      'Responsable du traitement',
      'Données collectées',
      'Finalités et bases légales',
      'Destinataires et sous-traitants',
      'Durées de conservation',
      'Vos droits',
      'Cookies',
      'Contact',
    ],
  },
}

const route = useRoute()
const page = computed(() => PAGES[String(route.params.slug)])
if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page introuvable', fatal: true })
}
useSeoMeta({ title: () => page.value?.title ?? '' })
</script>

<template>
  <article v-if="page" class="wrap max-w-[760px] py-12">
    <h1 class="text-[34px]">{{ page.title }}</h1>
    <UiAlertBox tone="warning" class="mt-6">Texte en cours de rédaction.</UiAlertBox>
    <section v-for="(section, i) in page.sections" :key="section" class="mt-8">
      <h2 class="text-xl">{{ i + 1 }}. {{ section }}</h2>
      <p class="mt-2 text-muted">À venir.</p>
    </section>
  </article>
</template>
