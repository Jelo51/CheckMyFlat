import type { Recommendation, VisitReportDraft } from '#shared/schemas/visitReport'

export interface VisitReportState {
  scores: Record<string, { score: number | null; comment: string }>
  globalScore: number | null
  justification: string
  filmingRefused: boolean
  negotiationPoints: string[]
  reserves: { text: string; mediaId: string | null }[]
  conclusion: string
  recommendation: Recommendation | null
}

export interface ReportMedia {
  id: string
  kind: 'photo' | 'video'
  mime: string
  size_bytes: number
  url: string | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error'

const emptyState = (): VisitReportState => ({
  scores: {},
  globalScore: null,
  justification: '',
  filmingRefused: false,
  negotiationPoints: [],
  reserves: [],
  conclusion: '',
  recommendation: null,
})

/** État → corps de l'API (schéma `visitReportDraftSchema`). */
export function toDraft(state: VisitReportState): VisitReportDraft {
  return {
    scores: Object.fromEntries(
      Object.entries(state.scores).map(([id, e]) => [
        id,
        { score: e.score, comment: e.comment.trim() || null },
      ]),
    ),
    globalScore: state.globalScore,
    justification: state.justification.trim() || null,
    filmingRefused: state.filmingRefused,
    negotiationPoints: state.negotiationPoints.map((p) => p.trim()).filter(Boolean),
    reserves: state.reserves
      .filter((r) => r.text.trim())
      .map((r) => ({ text: r.text.trim(), mediaId: r.mediaId })),
    conclusion: state.conclusion.trim() || null,
    recommendation: state.recommendation,
  }
}

/**
 * Compte rendu de visite : chargement, sauvegarde automatique (serveur +
 * copie locale pour les coupures réseau sur place) et médias.
 */
export function useVisitReport(requestId: string) {
  const supabase = useSupabaseClient()
  const state = reactive<VisitReportState>(emptyState())
  const media = ref<ReportMedia[]>([])
  const saveState = ref<SaveState>('idle')
  const savedAt = ref<Date | null>(null)
  const localKey = `cmf:visit-report:${requestId}`
  let timer: ReturnType<typeof setTimeout> | undefined
  let loaded = false

  async function load() {
    const { data: report } = await supabase
      .from('visit_reports')
      .select('*, report_scores(criterion_id, score, comment), report_reserves(text, media_id, position)')
      .eq('request_id', requestId)
      .maybeSingle()
    Object.assign(state, emptyState())
    if (report) {
      state.scores = Object.fromEntries(
        report.report_scores.map((s) => [s.criterion_id, { score: s.score, comment: s.comment ?? '' }]),
      )
      state.globalScore = report.global_score === null ? null : Number(report.global_score)
      state.justification = report.justification ?? ''
      state.filmingRefused = report.filming_refused
      state.negotiationPoints = (report.negotiation_points as string[]) ?? []
      state.reserves = [...report.report_reserves]
        .sort((a, b) => a.position - b.position)
        .map((r) => ({ text: r.text, mediaId: r.media_id }))
      state.conclusion = report.conclusion ?? ''
      state.recommendation = report.recommendation as Recommendation | null
    }
    // Copie locale plus récente (saisie hors ligne) : elle prime.
    try {
      const raw = localStorage.getItem(localKey)
      if (raw) {
        const local = JSON.parse(raw) as { savedAt: string; state: VisitReportState }
        if (!report || new Date(local.savedAt) > new Date(report.updated_at))
          Object.assign(state, local.state)
      }
    } catch {
      // stockage indisponible
    }
    await loadMedia()
    loaded = true
  }

  async function loadMedia() {
    try {
      media.value = await api<ReportMedia[]>(`/api/reports/${requestId}/media`)
    } catch {
      media.value = []
    }
  }

  async function save(): Promise<boolean> {
    clearTimeout(timer)
    saveState.value = 'saving'
    try {
      await api(`/api/visits/${requestId}/report`, {
        method: 'PUT',
        body: toDraft(state) as Record<string, unknown>,
      })
      savedAt.value = new Date()
      saveState.value = 'saved'
      try {
        localStorage.removeItem(localKey)
      } catch {
        // stockage indisponible
      }
      return true
    } catch (e) {
      saveState.value = navigator.onLine ? 'error' : 'offline'
      console.warn('[visite] sauvegarde', errorMessage(e))
      return false
    }
  }

  function scheduleSave() {
    if (!loaded) return
    try {
      localStorage.setItem(localKey, JSON.stringify({ savedAt: new Date().toISOString(), state }))
    } catch {
      // stockage indisponible
    }
    clearTimeout(timer)
    timer = setTimeout(save, 1500)
  }

  watch(state, scheduleSave, { deep: true })
  onMounted(() => window.addEventListener('online', save))
  onBeforeUnmount(() => {
    clearTimeout(timer)
    window.removeEventListener('online', save)
  })

  return { state, media, saveState, savedAt, load, loadMedia, save }
}
