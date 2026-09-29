import { describe, expect, it } from 'vitest'
import { renderEmail } from '../../server/utils/notifications/templates'

describe('emails transactionnels', () => {
  const content = {
    subject: 'Nouvelle proposition de prix — CMF-2026-0003',
    heading: 'Nouvelle proposition : 10,00 €',
    paragraphs: ['Pour la visite du 22 avril à 11 h 00 (40 avenue de Laon, Reims).'],
    cta: { label: 'Répondre', url: 'https://checkmyflat.fr/demandes/abc' },
  }

  it('produit une version HTML et une version texte', () => {
    const email = renderEmail(content)
    expect(email.subject).toBe(content.subject)
    expect(email.html).toContain('<html lang="fr">')
    expect(email.html).toContain('Nouvelle proposition : 10,00 €')
    expect(email.html).toContain('href="https://checkmyflat.fr/demandes/abc"')
    expect(email.text).toContain('Répondre : https://checkmyflat.fr/demandes/abc')
    expect(email.text).not.toContain('<')
  })

  it('échappe les contenus saisis par les utilisateurs', () => {
    const email = renderEmail({
      ...content,
      paragraphs: ['Motif : <script>alert("x")</script> & « guillemets »'],
      cta: { label: 'Voir', url: 'https://exemple.fr/?a="><img src=x>' },
    })
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp;')
    expect(email.html).not.toContain('"><img')
  })

  it('sans bouton si pas d’action', () => {
    const { cta: _cta, ...rest } = content
    const email = renderEmail(rest)
    expect(email.html).not.toContain('<a href')
  })
})
