/** Référence publique d'une demande : CMF-AAAA-NNNN. */
export const REFERENCE_PATTERN = /^CMF-\d{4}-\d{4,}$/

export function formatReference(year: number, sequence: number): string {
  return `CMF-${year}-${String(sequence).padStart(4, '0')}`
}
