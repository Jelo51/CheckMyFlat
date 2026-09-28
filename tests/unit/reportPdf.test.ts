import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildReportPdf, type ReportPdfData } from '../../server/utils/pdf/reportPdf'

const fontDir = join(import.meta.dirname, '../../server/assets/fonts')
const fonts = {
  regular: readFileSync(join(fontDir, 'public-sans-latin-400-normal.ttf')),
  semibold: readFileSync(join(fontDir, 'public-sans-latin-600-normal.ttf')),
  display: readFileSync(join(fontDir, 'bricolage-grotesque-latin-700-normal.ttf')),
  mono: readFileSync(join(fontDir, 'ibm-plex-mono-latin-600-normal.ttf')),
}

// PNG 1×1 gris, pour l'annexe photos.
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==',
  'base64',
)

const criteria = (labels: string[], scores: number[]) =>
  labels.map((label, i) => ({ label, score: scores[i]!, comment: i === 0 ? 'Tram à 3 minutes' : null }))

const data: ReportPdfData = {
  reference: 'CMF-2026-0008',
  title: 'T2 · 34 rue Chanzy, Reims',
  address: '34 rue Chanzy, 51100 Reims',
  visitedAt: '23 septembre à 14 h 30',
  deliveredAt: '23 septembre 2026',
  filmingRefused: false,
  photoCount: 3,
  videoCount: 1,
  globalScore: 4,
  weightedScore: 3.97,
  justification: null,
  blocks: [
    {
      label: 'Localisation et environnement',
      weight: 0.25,
      average: 4.67,
      criteria: criteria(
        ['Proximité des transports, commerces et services', 'Niveau sonore', 'Stationnement'],
        [5, 4, 5],
      ),
    },
    {
      label: 'Qualité globale du logement',
      weight: 0.3,
      average: 4,
      criteria: criteria(
        ['Luminosité', 'État des surfaces', 'Isolation', 'Surface réelle conforme à l’annonce'],
        [5, 3, 4, 4],
      ),
    },
    {
      label: 'Agencement et vie au quotidien',
      weight: 0.25,
      average: 4,
      criteria: criteria(['Cuisine', 'Salle de bains et WC', 'Rangements', 'Prises et fibre'], [4, 3, 4, 5]),
    },
    {
      label: 'Immeuble et annexes',
      weight: 0.2,
      average: 3,
      criteria: criteria(['Parties communes', 'Sécurité de l’accès', 'Cave, balcon, local vélo'], [3, 4, 2]),
    },
  ],
  negotiationPoints: ['Reprise de la peinture du séjour', 'Remplacement du joint de douche'],
  reserves: [
    { text: 'Rayure profonde sur le parquet', photoNumber: 2 },
    { text: 'Volet roulant bloqué', photoNumber: null },
  ],
  conclusion: 'Logement conforme à l’annonce, bien situé. Le local vélo annoncé n’existe pas.',
  recommendation: 'Déposer le dossier immédiatement',
  priorities: 'Bruit du boulevard, salle de bains.',
  photos: [1, 2, 3].map((number) => ({ number, data: pixel })),
}

describe('rapport PDF', () => {
  it('produit un PDF multi-pages avec annexe', async () => {
    const pdf = await buildReportPdf(data, fonts)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0
    expect(pages).toBeGreaterThanOrEqual(2)
    if (process.env.REPORT_PDF_OUT) writeFileSync(process.env.REPORT_PDF_OUT, pdf)
  })

  it('sans annexe si la prise de vue a été refusée', async () => {
    const full = await buildReportPdf(data, fonts)
    const pdf = await buildReportPdf(
      {
        ...data,
        filmingRefused: true,
        photos: [],
        photoCount: 0,
        videoCount: 0,
        justification: 'Humidité importante.',
      },
      fonts,
    )
    const count = (b: Buffer) => b.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0
    expect(count(pdf)).toBe(count(full) - 1)
  })
})
