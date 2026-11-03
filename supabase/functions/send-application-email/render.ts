import { ApplicationEmailError } from './errors.ts'

const TOKEN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g

export interface TemplateVariable {
  key: string
  required: boolean
  sample?: string
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function missingRequiredVariables(
  definitions: TemplateVariable[],
  values: Record<string, string>,
): string[] {
  return definitions
    .filter((variable) => variable.required && !values[variable.key]?.trim())
    .map((variable) => variable.key)
}

/** Substitutes {{key}} tokens. HTML values are escaped so they cannot become markup. */
export function renderEmailPart(
  source: string,
  values: Record<string, string>,
  mode: 'html' | 'text',
): string {
  return source.replace(TOKEN, (token, key: string) => {
    if (!Object.hasOwn(values, key)) return token
    const value = values[key] ?? ''
    if (mode === 'html') return escapeHtml(value)
    return value.replace(/[\r\n]+/g, ' ')
  })
}

export function testSubject(subject: string): string {
  const clean = subject.replace(/[\r\n]+/g, ' ').trim()
  if (!clean) throw new ApplicationEmailError(400, 'The test subject is empty.')
  if (clean.startsWith('[Test]')) return clean
  return `[Test] ${clean}`
}

export function testRenderValues(
  definitions: TemplateVariable[],
  provided: Record<string, string>,
): Record<string, string> {
  const values = { ...provided }
  for (const variable of definitions) {
    if (!values[variable.key]?.trim() && variable.sample?.trim()) values[variable.key] = variable.sample
  }
  return values
}

export function assertVariables(
  definitions: TemplateVariable[],
  values: Record<string, string>,
): void {
  const missing = missingRequiredVariables(definitions, values)
  if (missing.length > 0) {
    throw new ApplicationEmailError(400, `Missing required variables: ${missing.join(', ')}`)
  }
}
