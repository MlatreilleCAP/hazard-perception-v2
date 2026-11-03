import { ApplicationEmailError } from './errors.ts'
import type { TemplateVariable } from './render.ts'

export interface EmailSettingsRecord {
  organizationId: string
  fromName: string
  fromEmail: string
  replyTo: string | null
  defaultLocale: string
}

export interface EmailTemplateRecord {
  id: string
  organizationId: string
  key: string
  source: 'application' | 'auth_hook'
  sendable: boolean
}

export interface EmailVersionRecord {
  id: string
  templateId: string
  locale: string
  status: 'draft' | 'published' | 'archived'
  subject: string
  htmlBody: string
  textBody: string
  variables: TemplateVariable[]
}

export interface EmailJobRecord {
  id: string
  organizationId: string
  templateKey: string
}

export interface PreparedSend {
  settings: EmailSettingsRecord
  template: EmailTemplateRecord
  version: EmailVersionRecord
  locale: string
  source: 'draft' | 'published'
}

const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/

export function choosePublishedLocale(
  versions: EmailVersionRecord[],
  requestedLocale: string | null,
  defaultLocale: string,
): string | null {
  const published = new Set(
    versions.filter((version) => version.status === 'published').map((version) => version.locale),
  )
  const order = [requestedLocale, defaultLocale, 'en']
  const seen = new Set<string>()
  for (const locale of order) {
    if (!locale || seen.has(locale)) continue
    seen.add(locale)
    if (published.has(locale)) return locale
  }
  return null
}

function assertTemplateCatalog(input: {
  settings: EmailSettingsRecord
  template: EmailTemplateRecord
  versions: EmailVersionRecord[]
  requestedLocale: string | null
  job: EmailJobRecord | null
}): void {
  const { settings, template, versions, job } = input
  if (settings.organizationId !== template.organizationId) {
    throw new ApplicationEmailError(400, 'The template does not belong to this organization.')
  }
  if (template.source === 'auth_hook' || !template.sendable) {
    throw new ApplicationEmailError(403, 'Auth templates cannot be sent by application email.')
  }
  for (const version of versions) {
    if (version.templateId !== template.id) {
      throw new ApplicationEmailError(400, 'A template version does not belong to this template.')
    }
  }
  if (job) {
    if (job.organizationId !== template.organizationId || job.templateKey !== template.key) {
      throw new ApplicationEmailError(400, 'The email job does not belong to this template.')
    }
  }
  if (input.requestedLocale && !LOCALE.test(input.requestedLocale)) {
    throw new ApplicationEmailError(400, 'Use a locale such as en or fr-CA.')
  }
}

/**
 * Selects one published application version.
 * Drafts are ignored. Auth-hook templates are rejected.
 * A job, when present, must belong to the same organization and template.
 */
export function prepareApplicationSend(input: {
  settings: EmailSettingsRecord
  template: EmailTemplateRecord
  versions: EmailVersionRecord[]
  requestedLocale: string | null
  job: EmailJobRecord | null
}): PreparedSend {
  assertTemplateCatalog(input)
  const locale = choosePublishedLocale(input.versions, input.requestedLocale, input.settings.defaultLocale)
  if (!locale) throw new ApplicationEmailError(400, 'No published version is available for this template.')
  const version = input.versions.find((item) => item.status === 'published' && item.locale === locale)
  if (!version?.id) throw new ApplicationEmailError(400, 'No published version is available for this template.')
  return { settings: input.settings, template: input.template, version, locale, source: 'published' }
}

/**
 * Test-only selection. A draft is used only when source is draft.
 * Published selection never returns a draft, including for locale fallback.
 */
export function prepareTestSend(input: {
  settings: EmailSettingsRecord
  template: EmailTemplateRecord
  versions: EmailVersionRecord[]
  requestedLocale: string | null
  source: 'draft' | 'published'
}): PreparedSend {
  if (input.source === 'published') {
    return prepareApplicationSend({ ...input, job: null })
  }
  assertTemplateCatalog({ ...input, job: null })
  if (!input.requestedLocale) {
    throw new ApplicationEmailError(400, 'Choose a locale for the draft test.')
  }
  const draft = input.versions.find(
    (version) => version.status === 'draft' && version.locale === input.requestedLocale && version.id,
  )
  if (!draft) {
    throw new ApplicationEmailError(400, 'Save a draft for this locale before sending a draft test.')
  }
  return {
    settings: input.settings,
    template: input.template,
    version: draft,
    locale: input.requestedLocale,
    source: 'draft',
  }
}
