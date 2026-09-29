<script setup lang="ts">
import { ArrowRight, Camera, Euro, ShieldCheck } from 'lucide-vue-next'
import { formatEuros, URGENT_FEE_CENTS } from '#shared/domain/pricing'

useSeoMeta({
  title: 'Visite immobilière déléguée',
  ogTitle: 'CheckMyFlat — Quelqu’un y va pour vous.',
  description:
    'Vous repérez un logement, vous fixez le créneau avec l’agence. Un visiteur CheckMyFlat s’y rend, note 14 critères et vous remet un rapport sous 24 h.',
})

const supabase = useSupabaseClient()
const { data: zones } = await useAsyncData('landing-zones', async () => {
  const { data } = await supabase
    .from('pricing_zones')
    .select('id, label, base_price_cents, late_penalty_pct')
    .eq('active', true)
    .order('position')
  return data ?? []
})

const minPrice = computed(() =>
  zones.value?.length ? Math.min(...zones.value.map((z) => z.base_price_cents)) : null,
)

const steps = [
  {
    title: 'Vous déposez la demande',
    text: 'Lien de l’annonce, adresse, créneau déjà convenu avec l’agence, et ce que vous voulez qu’on vérifie en priorité. Vous proposez votre prix.',
  },
  {
    title: 'On se met d’accord, vous payez',
    text: 'Échange dans la messagerie, prix ajusté selon la zone et l’urgence. Le paiement se déclenche à l’acceptation. Visite annulée : remboursement automatique.',
  },
  {
    title: 'Le rapport arrive',
    text: 'Notes sur 14 critères, photos, vidéos si l’agence l’autorise, points à négocier et réserves pour l’état des lieux. En PDF, dans vos rapports.',
  },
]

const features = [
  {
    icon: Camera,
    title: 'Photos et vidéos réelles',
    text: 'Prises pendant la visite, pas retouchées, pas cadrées pour vendre. Si l’agence refuse la prise de vue, c’est écrit noir sur blanc dans le rapport.',
  },
  {
    icon: Euro,
    title: 'Ce qu’il y a à négocier',
    text: 'Peinture à reprendre, joint de douche, prise manquante : la liste des petits travaux à demander avant la signature du bail.',
  },
  {
    icon: ShieldCheck,
    title: 'Vos réserves d’état des lieux',
    text: 'Les défauts constatés avant votre entrée, datés et photographiés. De quoi éviter qu’on vous les impute à la sortie.',
  },
]

const penalties = computed(() =>
  (zones.value ?? [])
    .map(
      (z) =>
        `${z.late_penalty_pct ? `${z.late_penalty_pct} %` : 'aucune'} en ${z.label.split(' — ')[0]!.toLowerCase()}`,
    )
    .join(', '),
)

const faq = computed(() => [
  {
    q: 'L’agence accepte-t-elle qu’un tiers visite à ma place ?',
    a: 'Presque toujours, à condition d’être prévenue. Vous annoncez à l’agence qu’une personne mandatée se déplace pour vous. Si l’agence refuse, la demande est annulée et intégralement remboursée.',
  },
  {
    q: 'Et si on refuse les photos sur place ?',
    a: 'Le visiteur demande systématiquement l’autorisation avant la première prise de vue. En cas de refus, il ne photographie rien : vous recevez le rapport noté et commenté, et la mention du refus. Le tarif reste inchangé, la visite ayant bien eu lieu.',
  },
  {
    q: 'Quand suis-je débité ?',
    a: 'Quand vous acceptez le prix, une empreinte bancaire est posée sur votre carte ; le débit a lieu une fois la visite réalisée. Si le rendez-vous est à plus de 7 jours, le paiement s’ouvre 7 jours avant. Si la visite n’a pas lieu — annulation de l’agence, visiteur empêché, logement déjà loué — l’empreinte est libérée ou le montant remboursé automatiquement.',
  },
  {
    q: 'Et si j’annule moi-même ?',
    a: `Jusqu’à 24 h avant le rendez-vous, l’annulation est gratuite. Moins de 24 h avant, une pénalité s’applique selon la zone : ${penalties.value}.`,
  },
  {
    q: 'Combien de temps gardez-vous mes rapports ?',
    a: 'Ils restent dans vos rapports tant que votre compte est actif. Vous pouvez supprimer un rapport à tout moment, ou tout télécharger avant de fermer votre compte.',
  },
])
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="pb-7 pt-10 md:pb-10 md:pt-16">
      <div class="wrap grid items-center gap-10 md:grid-cols-[1.05fr_.95fr] md:gap-[52px]">
        <div>
          <span class="eyebrow">Visite immobilière déléguée</span>
          <h1 class="mt-3 text-[clamp(38px,5.2vw,60px)] font-extrabold tracking-[-0.045em]">
            Vous ne pouvez pas visiter.
            <em class="bg-[linear-gradient(transparent_62%,theme(colors.brand.tint)_62%)] px-0.5 not-italic">
              Quelqu’un y va pour vous.
            </em>
          </h1>
          <p class="mt-5 max-w-[44ch] text-lg text-muted">
            Vous repérez un logement, vous fixez le créneau avec l’agence. Un visiteur CheckMyFlat s’y rend,
            note 14 critères, photographie ce qui compte et vous remet un rapport sous 24 h.
          </p>
          <div class="mt-7 flex flex-wrap gap-3">
            <NuxtLink to="/demandes/nouvelle" class="btn btn-primary">
              Déposer une demande de visite
              <UiIcon :icon="ArrowRight" :size="18" />
            </NuxtLink>
            <a href="#rapport" class="btn btn-ghost">Voir un rapport type</a>
          </div>
          <dl class="mt-8 flex gap-7 border-t border-line pt-5">
            <div>
              <dt class="sr-only">Critères</dt>
              <dd class="font-mono text-xl font-semibold">14</dd>
              <dd class="text-[12.5px] leading-tight text-muted">
                critères notés
                <br />
                de 1 à 5
              </dd>
            </div>
            <div>
              <dt class="sr-only">Délai</dt>
              <dd class="font-mono text-xl font-semibold">24 h</dd>
              <dd class="text-[12.5px] leading-tight text-muted">
                rapport remis
                <br />
                après la visite
              </dd>
            </div>
            <div v-if="minPrice">
              <dt class="sr-only">Prix</dt>
              <dd class="font-mono text-xl font-semibold">{{ formatEuros(minPrice, true) }}</dd>
              <dd class="text-[12.5px] leading-tight text-muted">
                à partir de,
                <br />
                selon la zone
              </dd>
            </div>
          </dl>
        </div>
        <div id="rapport" class="scroll-mt-24">
          <LandingSampleReport />
        </div>
      </div>
    </section>

    <!-- Comment ça marche -->
    <section id="comment" class="scroll-mt-16 border-t border-line py-14">
      <div class="wrap">
        <div class="mb-8 max-w-[56ch]">
          <span class="eyebrow">Comment ça marche</span>
          <h2 class="mt-2.5 text-[clamp(26px,3.2vw,34px)]">Trois étapes, aucune visite à l’aveugle.</h2>
          <p class="mt-3 text-muted">
            Vous restez maître du calendrier : c’est vous qui calez le rendez-vous avec l’agence ou le
            propriétaire, nous nous chargeons du reste.
          </p>
        </div>
        <ol class="grid overflow-hidden rounded-lg border border-line bg-white md:grid-cols-3">
          <li
            v-for="(step, i) in steps"
            :key="step.title"
            class="border-b border-line p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
          >
            <div class="font-mono text-xs font-semibold tracking-[0.08em] text-brand-dark">
              ÉTAPE {{ String(i + 1).padStart(2, '0') }}
            </div>
            <h3 class="mb-2 mt-3 text-lg">{{ step.title }}</h3>
            <p class="text-sm text-muted">{{ step.text }}</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- Contenu du rapport -->
    <section class="border-t border-line py-14">
      <div class="wrap">
        <div class="mb-8 max-w-[56ch]">
          <span class="eyebrow">Ce que contient le rapport</span>
          <h2 class="mt-2.5 text-[clamp(26px,3.2vw,34px)]">Ce qu’une annonce ne dit jamais.</h2>
        </div>
        <div class="grid gap-4 md:grid-cols-3">
          <div v-for="f in features" :key="f.title" class="panel p-[22px]">
            <div
              class="mb-3.5 grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-brand-tint text-brand-dark"
            >
              <UiIcon :icon="f.icon" />
            </div>
            <h3 class="mb-2 text-base">{{ f.title }}</h3>
            <p class="text-sm text-muted">{{ f.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Tarifs -->
    <section id="tarifs" class="scroll-mt-16 border-t border-line py-14">
      <div class="wrap">
        <div class="grid items-center gap-6 rounded-lg bg-ink p-6 text-white sm:p-9 md:grid-cols-[1.1fr_1fr]">
          <div>
            <span class="eyebrow !text-[#A7AFA9]">Tarifs</span>
            <h2 class="mt-2.5 text-[clamp(26px,3.2vw,34px)] text-white">
              Le prix dépend d’où se trouve le logement.
            </h2>
            <p class="mt-3 text-[15px] text-[#C9CFCA]">
              Vous proposez un montant en déposant la demande. Nous le validons ou nous vous faisons une
              contre-proposition dans la messagerie. Rien n’est prélevé avant votre accord.
            </p>
          </div>
          <ul class="overflow-hidden rounded-md border border-white/15 bg-white/5">
            <li
              v-for="zone in zones"
              :key="zone.id"
              class="flex justify-between gap-4 border-b border-white/10 px-4 py-[11px] text-sm"
            >
              <span>{{ zone.label }}</span>
              <b class="whitespace-nowrap font-mono font-semibold">
                dès {{ formatEuros(zone.base_price_cents, true) }}
              </b>
            </li>
            <li class="flex justify-between gap-4 px-4 py-[11px] text-sm">
              <span>Visite sous 48 h</span>
              <b class="whitespace-nowrap font-mono font-semibold">
                + {{ formatEuros(URGENT_FEE_CENTS, true) }}
              </b>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="scroll-mt-16 border-t border-line py-14">
      <div class="wrap">
        <div class="mb-8 max-w-[56ch]">
          <span class="eyebrow">Questions fréquentes</span>
          <h2 class="mt-2.5 text-[clamp(26px,3.2vw,34px)]">Ce qu’on nous demande le plus.</h2>
        </div>
        <div class="border-t border-line">
          <details
            v-for="(item, i) in faq"
            :key="item.q"
            class="group border-b border-line py-4"
            :open="i === 0"
          >
            <summary
              class="flex cursor-pointer list-none justify-between gap-4 text-[15.5px] font-semibold [&::-webkit-details-marker]:hidden"
            >
              {{ item.q }}
              <span class="font-mono text-brand-dark group-open:hidden" aria-hidden="true">+</span>
              <span class="hidden font-mono text-brand-dark group-open:inline" aria-hidden="true">–</span>
            </summary>
            <p class="mt-2.5 max-w-[70ch] text-[14.5px] text-muted">{{ item.a }}</p>
          </details>
        </div>
      </div>
    </section>
  </div>
</template>
