import { Building2, LayoutPanelLeft, MapPin, Sun, type LucideIcon } from 'lucide-vue-next'
import type { ScoringBlock } from '#shared/domain/scoring'

/** Icônes Lucide des blocs (nom stocké en base). */
const BLOCK_ICONS: Record<string, LucideIcon> = {
  'map-pin': MapPin,
  sun: Sun,
  'layout-panel-left': LayoutPanelLeft,
  'building-2': Building2,
}

/** Blocs et critères de notation, lus en base (jamais codés en dur). */
export function useCriteria() {
  const supabase = useSupabaseClient()
  const { data } = useAsyncData(
    'criteria',
    async () => {
      const { data } = await supabase
        .from('criteria_blocks')
        .select(
          'id, code, label, subtitle, icon, weight, position, criteria(id, code, label, short_label, position, active)',
        )
        .order('position')
      return (data ?? []).map((b) => ({
        ...b,
        weight: Number(b.weight),
        criteria: b.criteria.filter((c) => c.active).sort((x, y) => x.position - y.position),
      }))
    },
    { getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key] },
  )

  const blocks = computed(() => data.value ?? [])
  const scoringBlocks = computed<ScoringBlock[]>(() =>
    blocks.value.map((b) => ({ id: b.id, weight: b.weight, criterionIds: b.criteria.map((c) => c.id) })),
  )
  const iconFor = (name: string) => BLOCK_ICONS[name] ?? MapPin

  return { blocks, scoringBlocks, iconFor, ready: computed(() => !!data.value) }
}
