import { HookError } from './errors.ts'

const DEFAULT_PRODUCT_URL = 'https://inroads.alertdriving.com'
const FONT = 'Poppins,Segoe UI,Helvetica,Arial,sans-serif'
const INK = '#222b3f'
const LINK = '#000000'
const LINE = '#e7e9ee'

/**
 * Shared card for Inroads mail. A button needs both a label and an http(s) URL.
 * Messages without an action leave both empty.
 */
export interface EmailLayoutProps {
  heading: string
  body: string
  buttonLabel: string
  actionUrl: string
  footerMessage: string
  productUrl?: string
  supportAddress?: string
  extraParagraphs?: string[]
  /** Reauthentication only. Link emails omit this. */
  code?: string | null
  codeLead?: string
  expiryNote?: string
}

export interface EmailLayoutDocument {
  html: string
  text: string
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function assertHttpUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new HookError(400, 'payload', 'Auth action URL is invalid.')
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new HookError(400, 'payload', 'Auth action URL is invalid.')
  }
}

function productLink(value: string | undefined): { href: string; domain: string } {
  const candidate = value?.trim() || DEFAULT_PRODUCT_URL
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('invalid')
    if (url.username || url.password) throw new Error('invalid')
    return { href: candidate, domain: url.host }
  } catch {
    return { href: DEFAULT_PRODUCT_URL, domain: 'inroads.alertdriving.com' }
  }
}

function supportCopy(address: string | undefined): { html: string; text: string } | null {
  const value = address?.trim() ?? ''
  if (!value) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new HookError(500, 'config', 'Support email address is invalid.')
  }
  const safe = escapeHtml(value)
  return {
    html: `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK};">Need help? Contact <a href="mailto:${safe}" style="color:${INK};text-decoration:underline;">${safe}</a>.</p>`,
    text: `Need help? Contact ${value}.`,
  }
}

function paragraphHtml(paragraphs: string[]): string {
  return paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK};">${escapeHtml(paragraph)}</p>`,
    )
    .join('')
}

export function renderEmailLayout(props: EmailLayoutProps): EmailLayoutDocument {
  const heading = props.heading.trim()
  const footerMessage = props.footerMessage.trim()
  const paragraphs = [props.body, ...(props.extraParagraphs ?? [])]
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const buttonLabel = props.buttonLabel.trim()
  const actionUrl = props.actionUrl.trim()
  const code = props.code?.trim() || ''
  const codeLead = props.codeLead?.trim() || 'Code'
  const expiryNote = props.expiryNote?.trim() || ''
  const product = productLink(props.productUrl)
  const support = supportCopy(props.supportAddress)

  if ((buttonLabel && !actionUrl) || (!buttonLabel && actionUrl)) {
    throw new HookError(400, 'payload', 'Auth action URL is invalid.')
  }
  if (actionUrl) assertHttpUrl(actionUrl)

  const text = [
    heading,
    '',
    ...paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(buttonLabel ? [buttonLabel, actionUrl, ''] : []),
    ...(code ? [codeLead, code, ''] : []),
    ...(expiryNote ? [expiryNote, ''] : []),
    ...(footerMessage ? [footerMessage, ''] : []),
    ...(support ? [support.text, ''] : []),
    product.domain,
  ].join('\n')

  const button = buttonLabel
    ? `<table role="presentation" class="email-button" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
                <tr>
                  <td align="center" bgcolor="#ff6bb5" style="border-radius:999px;background-color:#ff6bb5;background-image:linear-gradient(90deg,#ff6bb5,#707591);">
                    <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 28px;font-family:${FONT};font-size:15px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(buttonLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK};">or copy this link</p>
              <p style="margin:0 0 28px;font-family:${FONT};font-size:15px;line-height:1.5;word-break:break-all;color:${LINK};"><a class="email-link" href="${escapeHtml(actionUrl)}" style="color:${LINK};text-decoration:none;"><span style="color:${LINK};text-decoration:none;">${escapeHtml(actionUrl)}</span></a></p>`
    : ''

  const codeBlock = code
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK};">${escapeHtml(codeLead)}</p>
              <p style="margin:0 0 28px;font-family:${FONT};font-size:16px;line-height:1.55;font-weight:600;letter-spacing:0.08em;color:${INK};">${escapeHtml(code)}</p>`
    : ''

  const notes = [expiryNote, footerMessage]
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK};">${escapeHtml(paragraph)}</p>`,
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(heading)}</title>
  <style>
    a.email-link, a.email-link span { color: #000000 !important; text-decoration: none !important; }
    u + #body a.email-link, u + #body a.email-link span { color: #000000 !important; text-decoration: none !important; }
    @media only screen and (max-width: 600px) {
      .email-shell { padding: 16px 12px !important; }
      .email-card { width: 100% !important; }
      .email-inner { padding: 28px 20px !important; }
      .email-button a { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body id="body" style="margin:0;padding:0;background:#ffffff;color:${INK};font-family:${FONT};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${escapeHtml(heading)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;margin:0;padding:0;width:100%;">
    <tr>
      <td class="email-shell" align="center" style="padding:32px 16px;">
        <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" class="email-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;">
          <tr>
            <td class="email-inner" style="padding:40px 36px;font-family:${FONT};">
              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${escapeHtml(heading)}</h1>
              ${paragraphHtml(paragraphs)}
              ${button}
              ${codeBlock}
              ${notes}
              ${support?.html ?? ''}
              <p style="margin:12px 0 0;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK};">${escapeHtml(product.domain)}</p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`

  return { html, text }
}
