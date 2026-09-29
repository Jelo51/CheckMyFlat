import { describe, expect, it } from 'vitest'
import { safeNext } from '#shared/utils/url'

describe('redirection après connexion', () => {
  it('accepte les chemins internes', () => {
    expect(safeNext('/demandes/nouvelle')).toBe('/demandes/nouvelle')
    expect(safeNext('/admin?statut=payee')).toBe('/admin?statut=payee')
  })
  it('refuse les redirections externes', () => {
    for (const bad of [
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      'javascript:alert(1)',
      '',
      null,
      42,
    ]) {
      expect(safeNext(bad)).toBeNull()
    }
  })
})
