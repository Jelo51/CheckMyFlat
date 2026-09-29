import { describe, expect, it } from 'vitest'
import {
  REQUEST_STATUSES,
  TRANSITIONS,
  TRANSITION_ACTORS,
  canTransition,
  isEditable,
  nextStatuses,
  type RequestStatus,
  type TransitionActor,
} from '#shared/domain/stateMachine'

/** Table attendue, écrite à la main à partir de la spec (§4). */
const EXPECTED: Record<string, TransitionActor[]> = {
  'brouillon>publiee': ['owner'],
  'publiee>en_negociation': ['owner', 'admin'],
  'publiee>acceptee': ['admin'],
  'en_negociation>acceptee': ['owner', 'admin'],
  'acceptee>payee': ['system'],
  'payee>planifiee': ['admin'],
  'planifiee>realisee': ['assigned_agent'],
  'realisee>rapport_livre': ['system'],
  'brouillon>annulee': ['owner', 'admin'],
  'publiee>annulee': ['owner', 'admin'],
  'en_negociation>annulee': ['owner', 'admin'],
  'acceptee>annulee': ['owner', 'admin', 'system'],
  'payee>annulee': ['owner', 'admin'],
  'planifiee>annulee': ['owner', 'admin', 'assigned_agent'],
  'realisee>litige': ['owner', 'admin'],
  'rapport_livre>litige': ['owner', 'admin'],
}

describe('machine à états', () => {
  it('la table correspond exactement à la spec', () => {
    const actual = Object.fromEntries(TRANSITIONS.map((t) => [`${t.from}>${t.to}`, [...t.actors].sort()]))
    const expected = Object.fromEntries(Object.entries(EXPECTED).map(([k, v]) => [k, [...v].sort()]))
    expect(actual).toEqual(expected)
  })

  // Produit cartésien : chaque couple (de, vers) × chaque acteur.
  for (const from of REQUEST_STATUSES) {
    for (const to of REQUEST_STATUSES) {
      for (const actor of TRANSITION_ACTORS) {
        const allowed = EXPECTED[`${from}>${to}`]?.includes(actor) ?? false
        it(`${from} → ${to} par ${actor} : ${allowed ? 'autorisée' : 'rejetée'}`, () => {
          expect(canTransition(from, to, [actor])).toBe(allowed)
        })
      }
    }
  }

  it('annulation possible depuis tout état avant realisee, jamais après', () => {
    const before: RequestStatus[] = [
      'brouillon',
      'publiee',
      'en_negociation',
      'acceptee',
      'payee',
      'planifiee',
    ]
    for (const s of before) expect(canTransition(s, 'annulee', ['owner', 'admin'])).toBe(true)
    for (const s of ['realisee', 'rapport_livre', 'litige', 'annulee'] as const)
      expect(canTransition(s, 'annulee', ['owner', 'admin', 'assigned_agent', 'system'])).toBe(false)
  })

  it('le paiement ne peut être validé que par le système', () => {
    expect(canTransition('acceptee', 'payee', ['owner', 'admin', 'assigned_agent'])).toBe(false)
    expect(canTransition('acceptee', 'payee', ['system'])).toBe(true)
  })

  it('le rapport ne peut être livré que par le système', () => {
    expect(canTransition('realisee', 'rapport_livre', ['admin'])).toBe(false)
  })

  it('les états terminaux ne mènent nulle part', () => {
    expect(nextStatuses('annulee', [...TRANSITION_ACTORS])).toEqual([])
    expect(nextStatuses('litige', [...TRANSITION_ACTORS])).toEqual([])
  })

  it('aucune transition vers brouillon', () => {
    expect(TRANSITIONS.some((t) => t.to === 'brouillon')).toBe(false)
  })

  it('modifiable seulement en brouillon, publiee, en_negociation', () => {
    const editable = REQUEST_STATUSES.filter(isEditable)
    expect(editable).toEqual(['brouillon', 'publiee', 'en_negociation'])
  })
})
