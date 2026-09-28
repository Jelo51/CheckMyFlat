/**
 * Gabarits des emails transactionnels : HTML sobre (encre + vert) et
 * version texte. Contenu construit uniquement à partir de valeurs échappées.
 */

export interface EmailContent {
  subject: string
  heading: string
  paragraphs: string[]
  cta?: { label: string; url: string }
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

export function renderEmail(content: EmailContent): { subject: string; html: string; text: string } {
  const paragraphs = content.paragraphs
    .map(
      (p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#111827">${escapeHtml(p)}</p>`,
    )
    .join('')
  const cta = content.cta
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(content.cta.url)}" style="display:inline-block;background:#0E7A55;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:9px">${escapeHtml(content.cta.label)}</a></p>`
    : ''
  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;background:#FAFAF7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E5E7EB;border-radius:14px">
        <tr><td style="padding:22px 26px;border-bottom:1px solid #E5E7EB;font-weight:800;font-size:18px;color:#111827">
          <span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:#0E7A55;color:#fff;text-align:center;line-height:22px;font-size:14px;margin-right:8px">&#10003;</span>CheckMyFlat
        </td></tr>
        <tr><td style="padding:26px">
          <h1 style="margin:0 0 16px;font-size:21px;line-height:1.25;color:#111827">${escapeHtml(content.heading)}</h1>
          ${paragraphs}${cta}
        </td></tr>
        <tr><td style="padding:16px 26px;border-top:1px solid #E5E7EB;font-size:12px;color:#6B7280">
          Vous recevez cet email car vous avez un compte CheckMyFlat.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  const text = [
    content.heading,
    '',
    ...content.paragraphs.flatMap((p) => [p, '']),
    ...(content.cta ? [`${content.cta.label} : ${content.cta.url}`, ''] : []),
    '— CheckMyFlat',
  ].join('\n')
  return { subject: content.subject, html, text }
}
