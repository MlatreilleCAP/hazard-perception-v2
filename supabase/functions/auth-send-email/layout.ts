import { HookError } from './errors.ts'

const DEFAULT_PRODUCT_URL = 'https://inroads.alertdriving.com'
const FONT = 'Segoe UI,Helvetica,Arial,sans-serif'

/**
 * Shared chrome for Auth mail. Callers that need a button must pass both a
 * label and an http(s) URL. Messages without an action leave both empty.
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

function supportCopy(address: string | undefined): { html: string; text: string } {
  const value = address?.trim() ?? ''
  if (!value) {
    return {
      html: 'Need help? Contact your AlertDriving administrator.',
      text: 'Need help? Contact your AlertDriving administrator.',
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new HookError(500, 'config', 'Support email address is invalid.')
  }
  const safe = escapeHtml(value)
  return {
    html: `Need help? Contact <a href="mailto:${safe}" style="color:#192D43;text-decoration:underline;">${safe}</a>.`,
    text: `Need help? Contact ${value}.`,
  }
}

function paragraphHtml(paragraphs: string[]): string {
  return paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:#58616C;">${escapeHtml(paragraph)}</p>`,
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
    'AlertDriving',
    'INROADS',
    '',
    heading,
    '',
    ...paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(buttonLabel ? [buttonLabel, actionUrl, ''] : []),
    ...(code ? [codeLead, code, ''] : []),
    ...(expiryNote ? [expiryNote, ''] : []),
    footerMessage,
    '',
    support.text,
    product.domain,
  ].join('\n')

  const button = buttonLabel
    ? `<table role="presentation" class="email-button" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
                <tr>
                  <td bgcolor="#192D43" style="background:#192D43;border-radius:6px;">
                    <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 22px;font-family:${FONT};font-size:15px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(buttonLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 20px;font-family:${FONT};font-size:13px;line-height:1.5;color:#58616C;word-break:break-all;">Or copy this link:<br>${escapeHtml(actionUrl)}</p>`
    : ''

  const codeBlock = code
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:1.4;color:#58616C;">${escapeHtml(codeLead)}</p>
              <p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;line-height:1.2;letter-spacing:0.18em;font-weight:700;color:#171C24;">${escapeHtml(code)}</p>`
    : ''

  const expiry = expiryNote
    ? `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:#58616C;">${escapeHtml(expiryNote)}</p>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(heading)}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-shell { padding: 16px 12px !important; }
      .email-card { width: 100% !important; }
      .email-inner { padding-left: 20px !important; padding-right: 20px !important; }
      .email-button a { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F2F3F5;color:#58616C;font-family:${FONT};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F2F3F5;">${escapeHtml(heading)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2F3F5" style="background:#F2F3F5;margin:0;padding:0;width:100%;">
    <tr>
      <td class="email-shell" align="center" style="padding:32px 16px;">
        <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" class="email-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #E9EBEE;">
          <tr>
            <td class="email-inner" style="padding:28px 40px;border-bottom:1px solid #E9EBEE;font-family:${FONT};">
              <a href="${escapeHtml(product.href)}" style="font-family:${FONT};font-size:16px;line-height:1.2;font-weight:700;color:#171C24;text-decoration:none;">AlertDriving</a>
              <p style="margin:8px 0 0;font-family:${FONT};font-size:11px;line-height:1.2;font-weight:600;letter-spacing:0.18em;color:#58616C;">INROADS</p>
            </td>
          </tr>
          <tr>
            <td class="email-inner" style="padding:28px 40px 8px;font-family:${FONT};">
              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;color:#171C24;">${escapeHtml(heading)}</h1>
              ${paragraphHtml(paragraphs)}
              ${button}
              ${codeBlock}
              ${expiry}
            </td>
          </tr>
          <tr>
            <td class="email-inner" style="padding:20px 40px 28px;border-top:1px solid #E9EBEE;font-family:${FONT};">
              <p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:1.5;color:#58616C;">${escapeHtml(footerMessage)}</p>
              <p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:1.5;color:#58616C;">${support.html}</p>
              <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;"><a href="${escapeHtml(product.href)}" style="color:#192D43;text-decoration:underline;">${escapeHtml(product.domain)}</a></p>
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
