<script setup lang="ts">
import { Building2, Check, LayoutPanelLeft, MapPin, Sun } from 'lucide-vue-next'

/** Aperçu d'un rapport type (contenu d'exemple de la vitrine). */
const blocks = [
  { icon: MapPin, label: 'Localisation et environnement', sub: 'Transports, bruit, stationnement', score: 5 },
  { icon: Sun, label: 'Qualité globale du logement', sub: 'Luminosité, surfaces, isolation', score: 4 },
  {
    icon: LayoutPanelLeft,
    label: 'Agencement et vie au quotidien',
    sub: 'Cuisine, salle de bains, rangements',
    score: 4,
  },
  { icon: Building2, label: 'Immeuble et annexes', sub: 'Parties communes, accès, cave', score: 3 },
]
</script>

<template>
  <article class="card overflow-hidden" aria-label="Exemple de rapport de visite">
    <div class="flex items-start gap-4 border-b border-line px-5 py-[18px]">
      <div class="min-w-0">
        <div class="font-mono text-[11px] tracking-[0.06em] text-muted">CMF-2026-0412</div>
        <h3 class="mt-[3px] text-[17px]">T2 · 34 rue Chanzy, Reims</h3>
        <div class="mt-1 text-[12.5px] text-muted">Visite du 12 avril, 14 h 30 · 42 photos, 2 vidéos</div>
      </div>
      <UiScoreStamp :score="4.2" class="ml-auto" />
    </div>
    <div
      v-for="block in blocks"
      :key="block.label"
      class="flex items-center gap-3.5 border-b border-line px-5 py-[13px]"
    >
      <UiIcon :icon="block.icon" :size="18" class="text-muted" />
      <span class="min-w-0 flex-1 text-sm font-medium">
        {{ block.label }}
        <span class="block text-xs font-normal text-muted">{{ block.sub }}</span>
      </span>
      <UiScoreBar :score="block.score" />
    </div>
    <div class="flex items-center gap-2.5 bg-[#FAFBF9] px-5 py-3.5 text-[13px] text-muted">
      <UiIcon :icon="Check" :size="16" />
      Conclusion du visiteur : déposer le dossier immédiatement.
    </div>
  </article>
</template>
