/**
 * Machine à états des demandes de visite.
 *
 * Cette table est la source de vérité côté application. La fonction Postgres
 * `transition_request` applique exactement la même table (voir la migration
 * `request_transitions`) ; un test vérifie que les deux restent identiques.
 */

export const REQUEST_STATUSES = [
  'brouillon',
  'publiee',
  'en_negociation',
  'acceptee',
  'payee',
  'planifiee',
  'realisee',
  'rapport_livre',
  'annulee',
  'litige',
] as const

export type RequestStatus = (typeof REQUEST_STATUSES)[number]

/**
 * Qui déclenche une transition.
 * - `owner` : l'utilisateur qui a déposé la demande
 * - `assigned_agent` : l'agent assigné à la demande
 * - `admin` : un administrateur
 * - `system` : le serveur seul (webhook Stripe, génération du PDF, tâches planifiées)
 */
export const TRANSITION_ACTORS = ['owner', 'assigned_agent', 'admin', 'system'] as const
export type TransitionActor = (typeof TRANSITION_ACTORS)[number]

export interface TransitionRule {
  from: RequestStatus
  to: RequestStatus
  actors: readonly TransitionActor[]
}

const CANCELLABLE_FROM: readonly RequestStatus[] = [
  'brouillon',
  'publiee',
  'en_negociation',
  'acceptee',
  'payee',
  'planifiee',
]

export const TRANSITIONS: readonly TransitionRule[] = [
  { from: 'brouillon', to: 'publiee', actors: ['owner'] },
  { from: 'publiee', to: 'en_negociation', actors: ['owner', 'admin'] },
  { from: 'publiee', to: 'acceptee', actors: ['admin'] },
  { from: 'en_negociation', to: 'acceptee', actors: ['owner', 'admin'] },
  { from: 'acceptee', to: 'payee', actors: ['system'] },
  { from: 'payee', to: 'planifiee', actors: ['admin'] },
  { from: 'planifiee', to: 'realisee', actors: ['assigned_agent'] },
  { from: 'realisee', to: 'rapport_livre', actors: ['system'] },
  // Annulation : le client et l'admin partout avant la visite ; l'agent assigné
  // signale une visite non réalisée ; le système annule les demandes non payées.
  ...CANCELLABLE_FROM.map((from): TransitionRule => ({
    from,
    to: 'annulee',
    actors:
      from === 'planifiee'
        ? ['owner', 'admin', 'assigned_agent']
        : from === 'acceptee'
          ? ['owner', 'admin', 'system']
          : ['owner', 'admin'],
  })),
  { from: 'realisee', to: 'litige', actors: ['owner', 'admin'] },
  { from: 'rapport_livre', to: 'litige', actors: ['owner', 'admin'] },
]

export function findTransition(from: RequestStatus, to: RequestStatus): TransitionRule | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to)
}

export function canTransition(
  from: RequestStatus,
  to: RequestStatus,
  actors: readonly TransitionActor[],
): boolean {
  const rule = findTransition(from, to)
  return !!rule && rule.actors.some((a) => actors.includes(a))
}

export function nextStatuses(from: RequestStatus, actors: readonly TransitionActor[]): RequestStatus[] {
  return TRANSITIONS.filter((t) => t.from === from && t.actors.some((a) => actors.includes(a))).map(
    (t) => t.to,
  )
}

/** Le client peut modifier le contenu de sa demande. */
export const EDITABLE_STATUSES: readonly RequestStatus[] = ['brouillon', 'publiee', 'en_negociation']

export function isEditable(status: RequestStatus): boolean {
  return EDITABLE_STATUSES.includes(status)
}

/** Étapes du parcours nominal, pour la frise de progression. */
export const HAPPY_PATH: readonly RequestStatus[] = [
  'publiee',
  'en_negociation',
  'acceptee',
  'payee',
  'planifiee',
  'realisee',
  'rapport_livre',
]

export const STATUS_LABELS: Record<RequestStatus, string> = {
  brouillon: 'Brouillon',
  publiee: 'Publiée',
  en_negociation: 'En négociation',
  acceptee: 'Prix accepté',
  payee: 'Payée',
  planifiee: 'Planifiée',
  realisee: 'Visitée',
  rapport_livre: 'Rapport remis',
  annulee: 'Annulée',
  litige: 'Litige',
}

export type StatusTone = 'live' | 'wait' | 'done' | 'alert'

export const STATUS_TONES: Record<RequestStatus, StatusTone> = {
  brouillon: 'done',
  publiee: 'wait',
  en_negociation: 'live',
  acceptee: 'wait',
  payee: 'live',
  planifiee: 'live',
  realisee: 'live',
  rapport_livre: 'done',
  annulee: 'done',
  litige: 'alert',
}
