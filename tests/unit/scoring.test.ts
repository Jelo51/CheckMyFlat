import { describe, expect, it } from 'vitest'
import {
  blockAverage,
  formatScore,
  isComplete,
  needsJustification,
  roundScore,
  weightedScore,
  weightsAreValid,
  type ScoringBlock,
} from '#shared/domain/scoring'

const blocks: ScoringBlock[] = [
  { id: 'loc', weight: 0.25, criterionIds: ['c1', 'c2', 'c3'] },
  { id: 'qual', weight: 0.3, criterionIds: ['c4', 'c5', 'c6', 'c7'] },
  { id: 'agen', weight: 0.25, criterionIds: ['c8', 'c9', 'c10', 'c11'] },
  { id: 'imm', weight: 0.2, criterionIds: ['c12', 'c13', 'c14'] },
]

const full = {
  c1: 5,
  c2: 4,
  c3: 4, // loc 4,333
  c4: 5,
  c5: 3,
  c6: 4,
  c7: 4, // qual 4
  c8: 4,
  c9: 3,
  c10: 4,
  c11: 5, // agen 4
  c12: 3,
  c13: 4,
  c14: 2, // imm 3
}

describe('notation hybride', () => {
  it('moyenne de bloc', () => {
    expect(blockAverage(blocks[0]!, full)).toBeCloseTo(13 / 3)
    expect(blockAverage(blocks[3]!, {})).toBeNull()
  })

  it('ignore les valeurs hors échelle', () => {
    expect(blockAverage(blocks[0]!, { c1: 5, c2: 0, c3: 6 })).toBe(5)
    expect(blockAverage(blocks[0]!, { c1: 4.5 })).toBeNull()
  })

  it('moyenne pondérée complète = Σ moyenne × poids', () => {
    const expected = (13 / 3) * 0.25 + 4 * 0.3 + 4 * 0.25 + 3 * 0.2
    expect(weightedScore(blocks, full)).toBeCloseTo(expected, 10)
    expect(roundScore(weightedScore(blocks, full)!)).toBe(3.88)
  })

  it('aperçu partiel : les poids des blocs non notés sont redistribués', () => {
    expect(weightedScore(blocks, { c1: 4 })).toBe(4)
    expect(weightedScore(blocks, { c1: 5, c4: 3 })).toBeCloseTo((5 * 0.25 + 3 * 0.3) / 0.55)
    expect(weightedScore(blocks, {})).toBeNull()
  })

  it('complétude', () => {
    expect(isComplete(blocks, full)).toBe(true)
    expect(isComplete(blocks, { ...full, c14: null })).toBe(false)
  })

  it('justification obligatoire au-delà d’un point d’écart, strictement', () => {
    expect(needsJustification(4, 3)).toBe(false)
    expect(needsJustification(4.9, 3.9)).toBe(false)
    expect(needsJustification(5, 3.88)).toBe(true)
    expect(needsJustification(2.8, 3.88)).toBe(true)
    expect(needsJustification(2.9, 3.88)).toBe(false)
    expect(needsJustification(1, 2.01)).toBe(true)
  })

  it('poids valides : somme 1, chacun dans ]0,1]', () => {
    expect(weightsAreValid([0.25, 0.3, 0.25, 0.2])).toBe(true)
    expect(weightsAreValid([0.25, 0.3, 0.25, 0.25])).toBe(false)
    expect(weightsAreValid([0, 1])).toBe(false)
    expect(weightsAreValid([])).toBe(false)
  })

  it('format français', () => {
    expect(formatScore(4.2)).toBe('4,2')
    expect(formatScore(3.88)).toBe('3,9')
    expect(formatScore(4)).toBe('4,0')
  })
})
