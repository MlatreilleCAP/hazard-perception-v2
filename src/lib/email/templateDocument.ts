import type { EmailVariable } from '@/types/email'

const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/
const VARIABLE_TOKEN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g

export function isEmailLocale(value: string): boolean {
  return LOCALE_PATTERN.test(value)
}

export function isTemplateKey(value: string): boolean {
  return KEY_PATTERN.test(value)
}

export function isVariableKey(value: string): boolean {
  return KEY_PATTERN.test(value)
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function applyEmailVariables(source: string, variables: EmailVariable[]): string {
  const samples = new Map(variables.map((variable) => [variable.key, variable.sample]))
  return source.replace(VARIABLE_TOKEN, (token, key: string) => {
    const sample = samples.get(key)
    if (sample == null) return token
    return escapeHtml(sample)
  })
}

/** Removes active content before a preview document is shown. */
export function sanitizeEmailHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, iframe, object, embed, link, meta, base, form, style').forEach((node) => {
    node.remove()
  })
  for (const element of doc.body.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (
        name.startsWith('on') ||
        value.startsWith('javascript:') ||
        value.startsWith('data:text/html')
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  return doc.body.innerHTML
}

export function previewEmailDocument(subject: string, html: string, variables: EmailVariable[]): string {
  const safeSubject = escapeHtml(applyEmailVariables(subject, variables))
  const safeBody = sanitizeEmailHtml(applyEmailVariables(html, variables))
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; background: #f4f5f8; color: #222b3f; font-family: Georgia, "Times New Roman", serif; }
    .sheet { max-width: 600px; margin: 0 auto; background: #fff; padding: 28px 24px 32px; }
    h1 { margin: 0 0 16px; font-family: "Avenir Next", "Segoe UI", sans-serif; font-size: 22px; line-height: 1.3; }
    p { margin: 0 0 12px; font-size: 16px; line-height: 1.5; }
    a { color: #707591; }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>${safeSubject}</h1>
    ${safeBody}
  </div>
</body>
</html>`
}

export interface EmailHeadingBlock {
  kind: 'heading'
  text: string
}

export interface EmailParagraphBlock {
  kind: 'paragraph'
  text: string
}

export interface EmailButtonBlock {
  kind: 'button'
  label: string
  href: string
}

export type EmailBlock = EmailHeadingBlock | EmailParagraphBlock | EmailButtonBlock

function safeLink(href: string): string | null {
  const value = href.trim()
  if (value.startsWith('{{') && value.endsWith('}}')) return value
  if (/^https:\/\//i.test(value) || /^http:\/\//i.test(value) || /^mailto:/i.test(value)) return value
  return null
}

/** Returns null when the HTML uses markup the visual editor does not round-trip. */
export function parseEmailBlocks(html: string): EmailBlock[] | null {
  const trimmed = html.trim()
  if (!trimmed) return []
  const doc = new DOMParser().parseFromString(trimmed, 'text/html')
  const blocks: EmailBlock[] = []
  for (const node of doc.body.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) return null
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null
    const element = node as Element
    const tag = element.tagName
    if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
      if (element.children.length > 0) return null
      blocks.push({ kind: 'heading', text: element.textContent ?? '' })
      continue
    }
    if (tag === 'P') {
      const meaningful = [...element.childNodes].filter(
        (child) => child.nodeType !== Node.TEXT_NODE || Boolean(child.textContent?.trim()),
      )
      if (
        meaningful.length === 1 &&
        meaningful[0].nodeType === Node.ELEMENT_NODE &&
        (meaningful[0] as Element).tagName === 'A'
      ) {
        const link = meaningful[0] as HTMLAnchorElement
        blocks.push({
          kind: 'button',
          label: link.textContent ?? '',
          href: link.getAttribute('href') ?? '',
        })
        continue
      }
      if (element.querySelector('*')) return null
      blocks.push({ kind: 'paragraph', text: element.textContent ?? '' })
      continue
    }
    return null
  }
  return blocks
}

export function serializeEmailBlocks(blocks: EmailBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === 'heading') return `<h2>${escapeHtml(block.text)}</h2>`
      if (block.kind === 'paragraph') return `<p>${escapeHtml(block.text)}</p>`
      const href = safeLink(block.href) ?? 'https://inroads.alertdriving.com'
      return `<p><a href="${escapeHtml(href)}">${escapeHtml(block.label)}</a></p>`
    })
    .join('')
}

export function plainTextFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}
