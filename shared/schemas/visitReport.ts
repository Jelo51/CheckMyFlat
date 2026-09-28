import { z } from 'zod'
import {
  SCORE_MAX,
  SCORE_MIN,
  isComplete,
  needsJustification,
  weightedScore,
  type ScoringBlock,
} from '../domain/scoring'

export const RECOMMENDATIONS = ['deposer', 'option', 'refuser'] as const
export type Recommendation = (typeof RECOMMENDATIONS)[number]

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  deposer: 'Déposer le dossier immédiatement',
  option: 'Conserver en option',
  refuser: 'Refuser',
}

export const MAX_LIST_ITEMS = 30

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `${max} caractères maximum` })

const criterionEntry = z.object({
  score: z.number().int().min(SCORE_MIN).max(SCORE_MAX).nullable(),
  comment: text(1000).nullish(),
})

const reserve = z.object({
  text: text(500).min(1, { error: 'Décrivez la réserve' }),
  mediaId: z.uuid().nullish(),
})

export const globalScoreSchema = z
  .number({ error: 'Indiquez la note globale' })
  .min(SCORE_MIN, { error: 'Note entre 1 et 5' })
  .max(SCORE_MAX, { error: 'Note entre 1 et 5' })
  .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, {
    error: 'Une décimale maximum',
  })

/** Brouillon (sauvegarde automatique) : tout est facultatif. */
export const visitReportDraftSchema = z.object({
  scores: z.record(z.uuid(), criterionEntry).default({}),
  globalScore: globalScoreSchema.nullish(),
  justification: text(2000).nullish(),
  filmingRefused: z.boolean().default(false),
  negotiationPoints: z.array(text(300).min(1)).max(MAX_LIST_ITEMS).default([]),
  reserves: z.array(reserve).max(MAX_LIST_ITEMS).default([]),
  conclusion: text(1000).nullish(),
  recommendation: z.enum(RECOMMENDATIONS).nullish(),
})

export type VisitReportDraft = z.infer<typeof visitReportDraftSchema>

export interface SubmitContext {
  blocks: readonly ScoringBlock[]
  mediaCount: number
}

/**
 * Soumission : les 14 critères notés, note globale, justification si l'écart
 * avec la moyenne pondérée dépasse 1 point, médias sauf refus de l'agence,
 * conclusion et recommandation. Même schéma côté client et côté serveur.
 */
export function visitReportSubmitSchema(ctx: SubmitContext) {
  return visitReportDraftSchema
    .extend({
      globalScore: globalScoreSchema,
      conclusion: text(1000).min(10, { error: 'Rédigez une conclusion (10 caractères minimum)' }),
      recommendation: z.enum(RECOMMENDATIONS, { error: 'Choisissez une recommandation' }),
    })
    .superRefine((data, issue) => {
      const scores = Object.fromEntries(Object.entries(data.scores).map(([id, e]) => [id, e.score]))
      if (!isComplete(ctx.blocks, scores)) {
        issue.addIssue({ code: 'custom', path: ['scores'], message: 'Notez les 14 critères' })
        return
      }
      const weighted = weightedScore(ctx.blocks, scores)!
      if (needsJustification(data.globalScore, weighted) && (data.justification ?? '').trim().length < 10) {
        issue.addIssue({
          code: 'custom',
          path: ['justification'],
          message: 'Écart de plus d’un point avec la moyenne pondérée : justifiez la note globale',
        })
      }
      if (!data.filmingRefused && ctx.mediaCount === 0) {
        issue.addIssue({
          code: 'custom',
          path: ['media'],
          message: 'Ajoutez au moins une photo, ou indiquez que la prise de vue a été refusée',
        })
      }
    })
}

export type VisitReportSubmit = z.infer<ReturnType<typeof visitReportSubmitSchema>>
