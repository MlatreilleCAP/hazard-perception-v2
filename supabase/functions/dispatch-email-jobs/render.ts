import { JobFailure } from './errors.ts'

const TOKEN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g
const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/i

export interface TemplateVariable {
  key: string
  required: boolean
}

export interface DispatchVersion {
  id: string
  templateId: string
  locale: string
  status: 'draft' | 'published' | 'archived'
  subject: string
  htmlBody: string
  textBody: string
  variables: TemplateVariable[]
}

export interface DispatchTemplate {
  id: string
  organizationId: string
  key: string
  source: 'application' | 'auth_hook'
  sendable: boolean
}

export interface JobPayload {
  toEmail: string
  locale: string | null
  variables: Record<string, string>
}

export function parseJobPayload(value: unknown): JobPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new JobFailure('invalid_payload', 'The job payload is invalid.', false)
  }
  const record = value as Record<string, unknown>
  const toEmail = typeof record.toEmail === 'string' ? record.toEmail.trim() : ''
  if (!EMAIL.test(toEmail)) {
    throw new JobFailure('invalid_recipient', 'The job recipient is invalid.', false)
  }
  const locale = record.locale == null || record.locale === '' ? null : String(record.locale)
  if (locale && !LOCALE.test(locale)) {
    throw new JobFailure('invalid_payload', 'The job locale is invalid.', false)
  }
  const variables: Record<string, string> = {}
  if (record.variables != null) {
    if (!record.variables || typeof record.variables !== 'object' || Array.isArray(record.variables)) {
      throw new JobFailure('invalid_payload', 'The job variables are invalid.', false)
    }
    for (const [key, item] of Object.entries(record.variables as Record<string, unknown>)) {
      if (!/^[a-z][a-z0-9_]*$/.test(key) || typeof item !== 'string') {
        throw new JobFailure('invalid_payload', 'The job variables are invalid.', false)
      }
      variables[key] = item
    }
  }
  return { toEmail, locale, variables }
}

export function choosePublishedLocale(
  versions: DispatchVersion[],
  requestedLocale: string | null,
  defaultLocale: string,
): string | null {
  const published = new Set(
    versions.filter((version) => version.status === 'published').map((version) => version.locale),
  )
  const seen = new Set<string>()
  for (const locale of [requestedLocale, defaultLocale, 'en']) {
    if (!locale || seen.has(locale)) continue
    seen.add(locale)
    if (published.has(locale)) return locale
  }
  return null
}

export function prepareDispatch(input: {
  jobOrganizationId: string
  ruleOrganizationId: string
  ruleTemplateKey: string
  settingsOrganizationId: string
  template: DispatchTemplate
  versions: DispatchVersion[]
  requestedLocale: string | null
  defaultLocale: string
}): { version: DispatchVersion; locale: string } {
  const { template, versions } = input
  if (
    input.ruleOrganizationId !== input.jobOrganizationId ||
    input.settingsOrganizationId !== input.jobOrganizationId ||
    template.organizationId !== input.jobOrganizationId ||
    template.key !== input.ruleTemplateKey ||
    versions.some((version) => version.templateId !== template.id)
  ) {
    throw new JobFailure('organization_mismatch', 'The job does not belong to this organization.', false)
  }
  if (template.source === 'auth_hook' || !template.sendable) {
    throw new JobFailure('not_sendable', 'This template cannot be sent by application email.', false)
  }
  const locale = choosePublishedLocale(versions, input.requestedLocale, input.defaultLocale)
  const version = versions.find((item) => item.status === 'published' && item.locale === locale)
  if (!locale || !version?.id) {
    throw new JobFailure('missing_version', 'No published version is available for this template.', false)
  }
  return { version, locale }
}

export function assertRequiredVariables(definitions: TemplateVariable[], values: Record<string, string>): void {
  const missing = definitions.filter((variable) => variable.required && !values[variable.key]?.trim())
  if (missing.length > 0) {
    throw new JobFailure('missing_variables', `Missing required variables: ${missing.map((item) => item.key).join(', ')}`, false)
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderPart(source: string, values: Record<string, string>, mode: 'html' | 'text'): string {
  return source.replace(TOKEN, (token, key: string) => {
    if (!Object.hasOwn(values, key)) return token
    const value = values[key] ?? ''
    if (mode === 'html') return escapeHtml(value)
    return value.replace(/[\r\n]+/g, ' ')
  })
}
