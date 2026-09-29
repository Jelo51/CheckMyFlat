/**
 * Notation hybride : moyenne pondérée calculée + note globale libre.
 * Les blocs et leurs poids viennent de la base (`criteria_blocks`) ; rien n'est
 * codé en dur ici.
 */

export const SCORE_MIN = 1
export const SCORE_MAX = 5
/** Écart au-delà duquel la justification est obligatoire (strictement supérieur). */
export const JUSTIFICATION_THRESHOLD = 1

export interface ScoringBlock {
  id: string
  weight: number
  criterionIds: readonly string[]
}

export type ScoreMap = Readonly<Record<string, number | null | undefined>>

export function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= SCORE_MIN && value <= SCORE_MAX
}

/** Moyenne des critères notés d'un bloc, `null` si aucun n'est noté. */
export function blockAverage(block: ScoringBlock, scores: ScoreMap): number | null {
  const values = block.criterionIds.map((id) => scores[id]).filter(isValidScore)
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Moyenne pondérée des blocs notés. Les poids des blocs non notés sont
 * redistribués, pour que l'aperçu en direct reste lisible pendant la saisie.
 * Une fois tous les critères notés, c'est exactement Σ moyenne × poids.
 */
export function weightedScore(blocks: readonly ScoringBlock[], scores: ScoreMap): number | null {
  let total = 0
  let weights = 0
  for (const block of blocks) {
    const avg = blockAverage(block, scores)
    if (avg === null) continue
    total += avg * block.weight
    weights += block.weight
  }
  if (weights === 0) return null
  return total / weights
}

export function isComplete(blocks: readonly ScoringBlock[], scores: ScoreMap): boolean {
  return blocks.every((b) => b.criterionIds.every((id) => isValidScore(scores[id])))
}

/** Arrondi à 2 décimales pour le stockage (`numeric(3,2)`). */
export function roundScore(value: number): number {
  return Math.round(value * 100) / 100
}

export function needsJustification(globalScore: number, weighted: number): boolean {
  // Comparaison en centièmes pour éviter les erreurs de virgule flottante.
  return Math.abs(Math.round(globalScore * 100) - Math.round(weighted * 100)) > JUSTIFICATION_THRESHOLD * 100
}

/** Poids des blocs : chacun dans ]0, 1] et somme égale à 1. */
export function weightsAreValid(weights: readonly number[]): boolean {
  if (weights.length === 0) return false
  if (weights.some((w) => !(w > 0 && w <= 1))) return false
  return Math.abs(weights.reduce((s, w) => s + w, 0) - 1) < 1e-9
}

const scoreFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** « 4,2 » */
export function formatScore(value: number): string {
  return scoreFormatter.format(value)
}
