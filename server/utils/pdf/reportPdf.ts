import PDFDocument from 'pdfkit'
import { formatScore } from '#shared/domain/scoring'

/**
 * Rapport de visite en PDF (A4). Lisible en noir et blanc : chaque note est
 * une barre de 5 segments (pleins/vides) doublée du chiffre ; la couleur
 * n'est qu'un complément.
 */

export interface ReportPdfFonts {
  regular: Buffer
  semibold: Buffer
  display: Buffer
  mono: Buffer
}

export interface ReportPdfData {
  reference: string
  title: string
  address: string
  visitedAt: string
  deliveredAt: string
  filmingRefused: boolean
  photoCount: number
  videoCount: number
  globalScore: number
  weightedScore: number
  justification: string | null
  blocks: {
    label: string
    weight: number
    average: number
    criteria: { label: string; score: number; comment: string | null }[]
  }[]
  negotiationPoints: string[]
  reserves: { text: string; photoNumber: number | null }[]
  conclusion: string
  recommendation: string
  priorities: string | null
  /** Photos JPEG/PNG en annexe, numérotées dans l'ordre. */
  photos: { number: number; data: Buffer }[]
}

const INK = '#111827'
const MUTED = '#4B5563'
const LINE = '#D1D5DB'
const BRAND = '#0E7A55'
const SCORE = ['', '#DC2626', '#F97316', '#EAB308', '#84CC16', '#16A34A']

const PAGE = { width: 595.28, height: 841.89, margin: 48 }
const CONTENT_W = PAGE.width - PAGE.margin * 2

export function buildReportPdf(data: ReportPdfData, fonts: ReportPdfFonts): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: PAGE.margin, bottom: PAGE.margin + 18, left: PAGE.margin, right: PAGE.margin },
    bufferPages: true,
    // Police initiale : évite le chargement de Helvetica (fichiers AFM absents du build). Les types n'acceptent qu'un chemin, pdfkit accepte aussi un Buffer.
    font: fonts.regular as unknown as string,
    info: { Title: `Rapport de visite ${data.reference}`, Author: 'CheckMyFlat', Subject: data.address },
    lang: 'fr-FR',
  })
  doc.registerFont('regular', fonts.regular)
  doc.registerFont('semibold', fonts.semibold)
  doc.registerFont('display', fonts.display)
  doc.registerFont('mono', fonts.mono)

  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  header(doc, data)
  scores(doc, data)
  listSection(doc, 'À négocier avant la signature du bail', data.negotiationPoints, 'Aucun point relevé.')
  listSection(
    doc,
    'Réserves pour l’état des lieux',
    data.reserves.map((r) => (r.photoNumber ? `${r.text} (photo ${r.photoNumber})` : r.text)),
    'Aucune réserve relevée.',
  )
  conclusion(doc, data)
  annex(doc, data)
  footers(doc, data)

  doc.end()
  return done
}

type Doc = PDFKit.PDFDocument

function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > PAGE.height - PAGE.margin - 18) doc.addPage()
}

function eyebrow(doc: Doc, text: string) {
  doc
    .font('mono')
    .fontSize(8)
    .fillColor(MUTED)
    .text(text.toUpperCase(), PAGE.margin, doc.y, { width: CONTENT_W, characterSpacing: 1.2 })
  doc.moveDown(0.4)
}

function header(doc: Doc, data: ReportPdfData) {
  const top = doc.y
  // Logo
  doc.roundedRect(PAGE.margin, top, 18, 18, 4).fill(BRAND)
  doc
    .strokeColor('#FFFFFF')
    .lineWidth(2.2)
    .moveTo(PAGE.margin + 4.5, top + 9.5)
    .lineTo(PAGE.margin + 7.8, top + 12.8)
    .lineTo(PAGE.margin + 13.5, top + 5.8)
    .stroke()
  doc
    .font('display')
    .fontSize(13)
    .fillColor(INK)
    .text('CheckMyFlat', PAGE.margin + 25, top + 2)
  doc
    .font('mono')
    .fontSize(9)
    .fillColor(MUTED)
    .text(data.reference, PAGE.margin, top + 4, { width: CONTENT_W, align: 'right' })

  doc.y = top + 44
  doc.x = PAGE.margin
  eyebrow(doc, 'Rapport de visite')
  const textWidth = CONTENT_W - 100
  doc.font('display').fontSize(20).fillColor(INK).text(data.title, { width: textWidth })
  doc.font('regular').fontSize(10.5).fillColor(MUTED).text(data.address, { width: textWidth })
  doc.moveDown(0.3)
  const media = data.filmingRefused
    ? 'Prise de vue refusée par l’agence'
    : `${data.photoCount} photo${data.photoCount > 1 ? 's' : ''}, ${data.videoCount} vidéo${data.videoCount > 1 ? 's' : ''}`
  doc.text(`Visite du ${data.visitedAt} · ${media}`, { width: textWidth })
  doc.text(`Rapport remis le ${data.deliveredAt}`, { width: textWidth })

  const textBottom = doc.y
  stamp(doc, data.globalScore, PAGE.width - PAGE.margin - 40, top + 78)
  doc.x = PAGE.margin
  doc.y = Math.max(textBottom, top + 128) + 10
  doc
    .moveTo(PAGE.margin, doc.y)
    .lineTo(PAGE.width - PAGE.margin, doc.y)
    .lineWidth(0.8)
    .strokeColor(LINE)
    .stroke()
  doc.moveDown(1)
}

/** Tampon de la note globale. */
function stamp(doc: Doc, score: number, cx: number, cy: number) {
  doc.save()
  doc.rotate(-7, { origin: [cx, cy] })
  doc.circle(cx, cy, 38).fillAndStroke('#E4F1EB', BRAND)
  doc.lineWidth(2).circle(cx, cy, 38).stroke(BRAND)
  doc
    .font('mono')
    .fontSize(22)
    .fillColor('#0A5C40')
    .text(formatScore(score), cx - 38, cy - 16, { width: 76, align: 'center' })
  doc
    .font('semibold')
    .fontSize(7)
    .text('GLOBALE', cx - 38, cy + 10, { width: 76, align: 'center', characterSpacing: 0.8 })
  doc.restore()
}

/** Barre de 5 segments : pleins (couleur + encre) ou vides (contour). */
function scoreBar(doc: Doc, x: number, y: number, score: number) {
  const rounded = Math.min(5, Math.max(1, Math.round(score)))
  for (let i = 1; i <= 5; i++) {
    const sx = x + (i - 1) * 14
    if (i <= rounded) {
      doc.rect(sx, y, 12, 7).fillAndStroke(SCORE[rounded]!, INK)
    } else {
      doc.rect(sx, y, 12, 7).lineWidth(0.6).stroke(LINE)
    }
  }
  doc.lineWidth(1)
}

function scores(doc: Doc, data: ReportPdfData) {
  eyebrow(doc, 'Les 14 critères')
  doc
    .font('regular')
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(
      `Moyenne pondérée des quatre blocs : ${formatScore(data.weightedScore)} / 5. Note globale retenue par le visiteur : ${formatScore(data.globalScore)} / 5.`,
    )
  if (data.justification) {
    doc.moveDown(0.3).fillColor(INK).text(`Justification de la note globale : ${data.justification}`)
  }
  doc.moveDown(0.8)

  const labelW = CONTENT_W - 120
  for (const block of data.blocks) {
    ensureSpace(doc, 60)
    const y = doc.y
    doc.font('semibold').fontSize(11).fillColor(INK).text(block.label, PAGE.margin, y, { width: labelW })
    doc
      .font('mono')
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        `poids ${Math.round(block.weight * 100)} % · moyenne ${formatScore(block.average)}`,
        PAGE.margin,
        y + 1,
        {
          width: CONTENT_W,
          align: 'right',
        },
      )
    doc.y = y + 18
    for (const c of block.criteria) {
      const commentHeight = c.comment
        ? doc.font('regular').fontSize(8.5).heightOfString(c.comment, { width: labelW })
        : 0
      ensureSpace(doc, 22 + commentHeight)
      const rowY = doc.y
      doc.font('regular').fontSize(10).fillColor(INK).text(c.label, PAGE.margin, rowY, { width: labelW })
      const afterLabel = doc.y
      scoreBar(doc, PAGE.width - PAGE.margin - 100, rowY + 2.5, c.score)
      doc
        .font('mono')
        .fontSize(10)
        .fillColor(INK)
        .text(`${c.score}/5`, PAGE.width - PAGE.margin - 28, rowY, { width: 28, align: 'right' })
      doc.y = afterLabel
      if (c.comment) {
        doc
          .font('regular')
          .fontSize(8.5)
          .fillColor(MUTED)
          .text(c.comment, PAGE.margin, doc.y + 1, { width: labelW })
      }
      doc.y += 5
      doc
        .moveTo(PAGE.margin, doc.y)
        .lineTo(PAGE.width - PAGE.margin, doc.y)
        .lineWidth(0.4)
        .strokeColor(LINE)
        .stroke()
      doc.y += 5
    }
    doc.moveDown(0.8)
  }
}

function listSection(doc: Doc, title: string, items: string[], empty: string) {
  ensureSpace(doc, 50)
  doc.x = PAGE.margin
  eyebrow(doc, title)
  doc.font('regular').fontSize(10.5).fillColor(INK)
  if (!items.length) {
    doc.fillColor(MUTED).text(empty)
  } else {
    items.forEach((item, i) => {
      ensureSpace(doc, 16)
      doc.text(`${i + 1}. ${item}`, PAGE.margin, doc.y, { width: CONTENT_W, indent: 0 })
      doc.moveDown(0.25)
    })
  }
  doc.moveDown(1)
}

function conclusion(doc: Doc, data: ReportPdfData) {
  ensureSpace(doc, 90)
  eyebrow(doc, 'Conclusion du visiteur')
  doc.font('regular').fontSize(10.5).fillColor(INK).text(data.conclusion, { width: CONTENT_W })
  doc.moveDown(0.6)
  const y = doc.y
  doc.font('semibold').fontSize(10.5)
  const label = `Recommandation : ${data.recommendation}`
  const w = doc.widthOfString(label) + 20
  doc.roundedRect(PAGE.margin, y, w, 22, 11).lineWidth(1).stroke(BRAND)
  doc.fillColor(INK).text(label, PAGE.margin + 10, y + 6)
  doc.y = y + 32
  doc.x = PAGE.margin
  if (data.priorities) {
    doc.moveDown(0.6)
    eyebrow(doc, 'Vos points de vigilance')
    doc.font('regular').fontSize(9.5).fillColor(MUTED).text(data.priorities, { width: CONTENT_W })
  }
}

function annex(doc: Doc, data: ReportPdfData) {
  if (data.filmingRefused || (!data.photos.length && !data.videoCount)) return
  doc.addPage()
  eyebrow(doc, 'Annexe · photos')
  if (data.videoCount) {
    doc
      .font('regular')
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(
        `${data.videoCount} vidéo${data.videoCount > 1 ? 's' : ''} disponible${data.videoCount > 1 ? 's' : ''} dans votre espace en ligne.`,
      )
    doc.moveDown(0.6)
  }
  const gap = 14
  const cellW = (CONTENT_W - gap) / 2
  const cellH = 190
  let col = 0
  for (const photo of data.photos) {
    if (col === 0) ensureSpace(doc, cellH + 20)
    const x = PAGE.margin + col * (cellW + gap)
    const y = doc.y
    try {
      doc.image(photo.data, x, y, { fit: [cellW, cellH], align: 'center', valign: 'center' })
    } catch {
      doc.rect(x, y, cellW, cellH).stroke(LINE)
    }
    doc
      .font('mono')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(`Photo ${photo.number}`, x, y + cellH + 3, { width: cellW })
    if (col === 1) {
      doc.y = y + cellH + 20
      col = 0
    } else {
      doc.y = y
      col = 1
    }
  }
}

function footers(doc: Doc, data: ReportPdfData) {
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    // Écrire dans la marge basse sans déclencher de saut de page.
    const bottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc
      .font('mono')
      .fontSize(8)
      .fillColor(MUTED)
      .text(`${data.reference} · page ${i + 1}/${range.count}`, PAGE.margin, PAGE.height - PAGE.margin + 4, {
        width: CONTENT_W,
        align: 'right',
        lineBreak: false,
      })
    doc.page.margins.bottom = bottom
  }
}
