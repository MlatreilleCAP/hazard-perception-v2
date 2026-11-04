import { isEmailLocale, isTemplateKey, isVariableKey } from '@/lib/email/templateDocument'
import { emailAdminClient, explainEmailDatabaseError } from '@/services/emailAccess'
import type {
  EmailActivityItem,
  EmailAutomationRule,
  EmailDashboard,
  EmailDraftInput,
  EmailMessageRecord,
  EmailMessageStatus,
  EmailSettingsDetail,
  EmailTemplateDetail,
  EmailTemplateSource,
  EmailTemplateSummary,
  EmailTemplateVersion,
  EmailTestSendResult,
  EmailVariable,
  EmailVersionStatus,
} from '@/types/email'

const SENT_STATUSES: EmailMessageStatus[] = ['sent', 'delivered', 'bounced', 'complained']

const MESSAGE_STATUSES = new Set<EmailMessageStatus>([
  'queued',
  'sending',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
  'suppressed',
])

async function stopOnEmailError(
  client: Awaited<ReturnType<typeof emailAdminClient>>,
  error: { message: string; code?: string | null } | null,
): Promise<void> {
  if (error) throw await explainEmailDatabaseError(client, error)
}

function asCount(count: number | null, error: { message: string } | null): number {
  if (error) throw new Error(error.message)
  return count ?? 0
}

function isMessageStatus(value: string): value is EmailMessageStatus {
  return MESSAGE_STATUSES.has(value as EmailMessageStatus)
}

/** Dashboard figures from the email catalog. Empty tables stay at zero. */
export async function loadEmailDashboard(): Promise<EmailDashboard> {
  const client = await emailAdminClient()

  const [templates, versions, automations, sent, recent] = await Promise.all([
    client.from('email_templates').select('id', { count: 'exact', head: true }),
    client.from('email_template_versions').select('template_id, status').in('status', ['published', 'draft']),
    client
      .from('email_automation_rules')
      .select('id', { count: 'exact', head: true })
      .eq('enabled', true),
    client
      .from('email_messages')
      .select('id', { count: 'exact', head: true })
      .in('status', SENT_STATUSES),
    client
      .from('email_messages')
      .select('id, template_key, to_email, subject, status, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  await stopOnEmailError(client, versions.error)
  await stopOnEmailError(client, recent.error)
  await stopOnEmailError(client, templates.error)
  await stopOnEmailError(client, automations.error)
  await stopOnEmailError(client, sent.error)

  const published = new Set<string>()
  const drafts = new Set<string>()
  for (const row of versions.data ?? []) {
    const templateId = String(row.template_id ?? '')
    if (!templateId) continue
    if (row.status === 'published') published.add(templateId)
    if (row.status === 'draft') drafts.add(templateId)
  }

  const activity: EmailActivityItem[] = []
  for (const row of recent.data ?? []) {
    const status = String(row.status ?? '')
    if (!isMessageStatus(status)) continue
    activity.push({
      id: String(row.id),
      templateKey: String(row.template_key ?? ''),
      toEmail: String(row.to_email ?? ''),
      subject: String(row.subject ?? ''),
      status,
      createdAt: String(row.created_at ?? ''),
    })
  }

  return {
    totalTemplates: asCount(templates.count, templates.error),
    publishedTemplates: published.size,
    draftTemplates: drafts.size,
    enabledAutomations: asCount(automations.count, automations.error),
    emailsSent: asCount(sent.count, sent.error),
    recent: activity,
  }
}

function asSource(value: string): EmailTemplateSource {
  return value === 'auth_hook' ? 'auth_hook' : 'application'
}

function asStatus(value: string): EmailVersionStatus | null {
  if (value === 'draft' || value === 'published' || value === 'archived') return value
  return null
}

function parseVariables(value: unknown): EmailVariable[] {
  if (!Array.isArray(value)) return []
  const variables: EmailVariable[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.key !== 'string' || !isVariableKey(row.key)) continue
    variables.push({
      key: row.key,
      required: row.required === true,
      sample: typeof row.sample === 'string' ? row.sample : '',
      description: typeof row.description === 'string' ? row.description : '',
    })
  }
  return variables
}

function assertVariables(variables: EmailVariable[]): EmailVariable[] {
  const seen = new Set<string>()
  return variables.map((variable) => {
    const key = variable.key.trim()
    if (!isVariableKey(key)) throw new Error('Variable keys use lowercase letters, numbers, and underscores.')
    if (seen.has(key)) throw new Error(`Variable ${key} is listed twice.`)
    seen.add(key)
    return {
      key,
      required: variable.required === true,
      sample: variable.sample,
      description: variable.description,
    }
  })
}

export async function listEmailTemplates(): Promise<EmailTemplateSummary[]> {
  const client = await emailAdminClient()
  const [templates, versions] = await Promise.all([
    client
      .from('email_templates')
      .select('id, key, name, description, source, sendable, updated_at')
      .order('name'),
    client.from('email_template_versions').select('template_id, locale, status, updated_at'),
  ])
  if (templates.error) throw await explainEmailDatabaseError(client, templates.error)
  if (versions.error) throw await explainEmailDatabaseError(client, versions.error)

  const byTemplate = new Map<string, { locales: Set<string>; updatedAt: string; flags: EmailTemplateSummary }>()
  const summaries: EmailTemplateSummary[] = (templates.data ?? []).map((row) => {
    const summary: EmailTemplateSummary = {
      id: String(row.id),
      key: String(row.key ?? ''),
      name: String(row.name ?? ''),
      description: String(row.description ?? ''),
      source: asSource(String(row.source ?? '')),
      sendable: row.sendable === true,
      updatedAt: String(row.updated_at ?? ''),
      locales: [],
      hasPublished: false,
      hasDraft: false,
      hasArchived: false,
    }
    byTemplate.set(summary.id, {
      locales: new Set(),
      updatedAt: summary.updatedAt,
      flags: summary,
    })
    return summary
  })

  for (const row of versions.data ?? []) {
    const bucket = byTemplate.get(String(row.template_id ?? ''))
    if (!bucket) continue
    const locale = String(row.locale ?? '')
    if (locale) bucket.locales.add(locale)
    const updatedAt = String(row.updated_at ?? '')
    if (updatedAt > bucket.updatedAt) bucket.updatedAt = updatedAt
    const status = asStatus(String(row.status ?? ''))
    if (status === 'published') bucket.flags.hasPublished = true
    if (status === 'draft') bucket.flags.hasDraft = true
    if (status === 'archived') bucket.flags.hasArchived = true
  }

  for (const summary of summaries) {
    const bucket = byTemplate.get(summary.id)
    if (!bucket) continue
    summary.locales = [...bucket.locales].sort()
    summary.updatedAt = bucket.updatedAt
  }
  return summaries
}

export async function loadEmailTemplate(key: string): Promise<EmailTemplateDetail | null> {
  const client = await emailAdminClient()
  const { data, error } = await client
    .from('email_templates')
    .select('id, organization_id, key, name, description, source, sendable, updated_at')
    .eq('key', key)
    .maybeSingle()
  if (error) throw await explainEmailDatabaseError(client, error)
  if (!data) return null

  const versions = await client
    .from('email_template_versions')
    .select('id, locale, version, status, subject, html_body, text_body, variables, updated_at, published_at')
    .eq('template_id', data.id)
    .order('locale')
    .order('version', { ascending: false, nullsFirst: false })
  if (versions.error) throw await explainEmailDatabaseError(client, versions.error)

  const mapped: EmailTemplateVersion[] = []
  for (const row of versions.data ?? []) {
    const status = asStatus(String(row.status ?? ''))
    if (!status) continue
    mapped.push({
      id: String(row.id),
      locale: String(row.locale ?? ''),
      version: typeof row.version === 'number' ? row.version : null,
      status,
      subject: String(row.subject ?? ''),
      htmlBody: String(row.html_body ?? ''),
      textBody: String(row.text_body ?? ''),
      variables: parseVariables(row.variables),
      updatedAt: String(row.updated_at ?? ''),
      publishedAt: row.published_at ? String(row.published_at) : null,
    })
  }

  return {
    id: String(data.id),
    organizationId: String(data.organization_id),
    key: String(data.key),
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    source: asSource(String(data.source ?? '')),
    sendable: data.sendable === true,
    updatedAt: String(data.updated_at ?? ''),
    versions: mapped,
  }
}

export async function createApplicationTemplate(input: {
  name: string
  key: string
  description: string
  createdBy: string | null
}): Promise<string> {
  const name = input.name.trim()
  const key = input.key.trim()
  if (!name) throw new Error('Enter a template name.')
  if (!isTemplateKey(key)) {
    throw new Error('Keys start with a letter and use lowercase letters, numbers, and underscores.')
  }
  const client = await emailAdminClient()
  const organization = await client
    .from('organizations')
    .select('id')
    .eq('slug', 'alertdriving')
    .maybeSingle()
  if (organization.error) throw await explainEmailDatabaseError(client, organization.error)
  if (!organization.data?.id) throw new Error('AlertDriving organization was not found.')

  const created = await client
    .from('email_templates')
    .insert({
      organization_id: organization.data.id,
      key,
      name,
      description: input.description.trim(),
      source: 'application',
      sendable: true,
    })
    .select('id')
    .single()
  if (created.error) throw await explainEmailDatabaseError(client, created.error)

  const draft = await client.from('email_template_versions').insert({
    template_id: created.data.id,
    locale: 'en',
    version: null,
    status: 'draft',
    subject: '',
    html_body: '<p>Hello {{recipient_name}},</p>',
    text_body: 'Hello {{recipient_name}},',
    variables: [
      {
        key: 'recipient_name',
        required: true,
        sample: 'Alex',
        description: 'Person the message greets.',
      },
    ],
    published_at: null,
    created_by: input.createdBy,
  })
  if (draft.error) throw await explainEmailDatabaseError(client, draft.error)
  return key
}

export async function saveTemplateDetails(
  templateId: string,
  name: string,
  description: string,
): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Enter a template name.')
  const client = await emailAdminClient()
  const { error } = await client
    .from('email_templates')
    .update({ name: trimmed, description: description.trim() })
    .eq('id', templateId)
    .eq('source', 'application')
  if (error) throw await explainEmailDatabaseError(client, error)
}

export async function saveEmailDraft(input: EmailDraftInput, draftId: string | null): Promise<void> {
  if (!isEmailLocale(input.locale)) throw new Error('Use a locale such as en or fr-CA.')
  const variables = assertVariables(input.variables)
  const client = await emailAdminClient()
  if (draftId) {
    const { error } = await client
      .from('email_template_versions')
      .update({
        subject: input.subject,
        html_body: input.htmlBody,
        text_body: input.textBody,
        variables,
      })
      .eq('id', draftId)
      .eq('status', 'draft')
    if (error) throw await explainEmailDatabaseError(client, error)
    return
  }

  const { error } = await client.from('email_template_versions').insert({
    template_id: input.templateId,
    locale: input.locale,
    version: null,
    status: 'draft',
    subject: input.subject,
    html_body: input.htmlBody,
    text_body: input.textBody,
    variables,
    published_at: null,
    created_by: input.createdBy,
  })
  if (error) throw await explainEmailDatabaseError(client, error)
}

export async function publishEmailLocale(input: EmailDraftInput, draftId: string | null): Promise<void> {
  if (!input.subject.trim() || !input.htmlBody.trim() || !input.textBody.trim()) {
    throw new Error('A published version needs a subject, HTML body, and plain-text body.')
  }
  await saveEmailDraft(input, draftId)
  const client = await emailAdminClient()
  const existing = await client
    .from('email_template_versions')
    .select('id, version, status')
    .eq('template_id', input.templateId)
    .eq('locale', input.locale)
  if (existing.error) throw await explainEmailDatabaseError(client, existing.error)
  const rows = existing.data ?? []
  const current = rows.find((row) => row.status === 'published')
  if (current) {
    const archived = await client
      .from('email_template_versions')
      .update({ status: 'archived' })
      .eq('id', current.id)
      .eq('status', 'published')
    if (archived.error) throw await explainEmailDatabaseError(client, archived.error)
  }
  const nextVersion = rows.reduce((highest, row) => {
    return typeof row.version === 'number' ? Math.max(highest, row.version) : highest
  }, 0) + 1
  const published = await client.from('email_template_versions').insert({
    template_id: input.templateId,
    locale: input.locale,
    version: nextVersion,
    status: 'published',
    subject: input.subject,
    html_body: input.htmlBody,
    text_body: input.textBody,
    variables: assertVariables(input.variables),
    published_at: new Date().toISOString(),
    created_by: input.createdBy,
  })
  if (published.error) throw await explainEmailDatabaseError(client, published.error)
}

export async function archivePublishedVersion(versionId: string): Promise<void> {
  const client = await emailAdminClient()
  const { error } = await client
    .from('email_template_versions')
    .update({ status: 'archived' })
    .eq('id', versionId)
    .eq('status', 'published')
  if (error) throw await explainEmailDatabaseError(client, error)
}

export async function deleteApplicationTemplate(templateId: string): Promise<void> {
  const client = await emailAdminClient()
  const drafts = await client
    .from('email_template_versions')
    .delete()
    .eq('template_id', templateId)
    .eq('status', 'draft')
  if (drafts.error) throw await explainEmailDatabaseError(client, drafts.error)
  const { error } = await client.from('email_templates').delete().eq('id', templateId).eq('source', 'application')
  if (error) throw await explainEmailDatabaseError(client, error)
}

const MESSAGE_LIMIT = 200

export async function listEmailAutomations(): Promise<EmailAutomationRule[]> {
  const client = await emailAdminClient()
  const [rules, organizations, templates] = await Promise.all([
    client
      .from('email_automation_rules')
      .select('id, organization_id, template_key, event_key, enabled, schedule')
      .order('event_key'),
    client.from('organizations').select('id, name'),
    client.from('email_templates').select('organization_id, key, name'),
  ])
  if (rules.error) throw await explainEmailDatabaseError(client, rules.error)
  if (organizations.error) throw await explainEmailDatabaseError(client, organizations.error)
  if (templates.error) throw await explainEmailDatabaseError(client, templates.error)

  const organizationNames = new Map(
    (organizations.data ?? []).map((row) => [String(row.id), String(row.name ?? '')]),
  )
  const templateNames = new Map(
    (templates.data ?? []).map((row) => [`${row.organization_id}:${row.key}`, String(row.name ?? '')]),
  )

  return (rules.data ?? []).map((row) => {
    const organizationId = String(row.organization_id)
    const templateKey = String(row.template_key ?? '')
    return {
      id: String(row.id),
      organizationId,
      organizationName: organizationNames.get(organizationId) || 'Unknown organization',
      templateKey,
      templateName: templateNames.get(`${organizationId}:${templateKey}`) || templateKey,
      eventKey: String(row.event_key ?? ''),
      enabled: row.enabled === true,
      schedule: row.schedule ? String(row.schedule) : null,
    }
  })
}

/** Changes only the enabled flag. Does not create jobs or send mail. */
export async function setEmailAutomationEnabled(ruleId: string, enabled: boolean): Promise<void> {
  const client = await emailAdminClient()
  const { error } = await client.from('email_automation_rules').update({ enabled }).eq('id', ruleId)
  if (error) throw await explainEmailDatabaseError(client, error)
}

export async function listEmailMessages(): Promise<{ messages: EmailMessageRecord[]; truncated: boolean }> {
  const client = await emailAdminClient()
  const { data, error } = await client
    .from('email_messages')
    .select('id, to_email, template_key, locale, subject, status, created_at, sent_at')
    .order('created_at', { ascending: false })
    .limit(MESSAGE_LIMIT)
  if (error) throw await explainEmailDatabaseError(client, error)

  const messages: EmailMessageRecord[] = []
  for (const row of data ?? []) {
    const status = String(row.status ?? '')
    if (!isMessageStatus(status)) continue
    messages.push({
      id: String(row.id),
      toEmail: String(row.to_email ?? ''),
      templateKey: String(row.template_key ?? ''),
      locale: String(row.locale ?? ''),
      subject: String(row.subject ?? ''),
      status,
      createdAt: String(row.created_at ?? ''),
      sentAt: row.sent_at ? String(row.sent_at) : null,
    })
  }
  return { messages, truncated: (data?.length ?? 0) >= MESSAGE_LIMIT }
}

function optionalEmail(value: string, label: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(trimmed)) throw new Error(`${label} must be an email address.`)
  return trimmed
}

export async function loadEmailSettings(): Promise<EmailSettingsDetail | null> {
  const client = await emailAdminClient()
  const [settings, organizations] = await Promise.all([
    client
      .from('email_settings')
      .select('organization_id, from_name, from_email, reply_to, product_url, support_address, default_locale')
      .limit(1)
      .maybeSingle(),
    client.from('organizations').select('id, name'),
  ])
  if (settings.error) throw await explainEmailDatabaseError(client, settings.error)
  if (organizations.error) throw await explainEmailDatabaseError(client, organizations.error)
  if (!settings.data) return null
  const organizationId = String(settings.data.organization_id)
  const organization = (organizations.data ?? []).find((row) => String(row.id) === organizationId)
  return {
    organizationId,
    organizationName: String(organization?.name ?? ''),
    fromName: String(settings.data.from_name ?? ''),
    fromEmail: String(settings.data.from_email ?? ''),
    replyTo: settings.data.reply_to ? String(settings.data.reply_to) : '',
    productUrl: String(settings.data.product_url ?? ''),
    supportAddress: settings.data.support_address ? String(settings.data.support_address) : '',
    defaultLocale: String(settings.data.default_locale ?? 'en'),
  }
}

export async function saveEmailSettings(
  settings: EmailSettingsDetail,
  updatedBy: string | null,
): Promise<void> {
  const fromName = settings.fromName.trim()
  const fromEmail = settings.fromEmail.trim()
  const productUrl = settings.productUrl.trim()
  const defaultLocale = settings.defaultLocale.trim()
  if (!fromName) throw new Error('Enter a sender name.')
  if (!/^[^@\s]+@auth\.alertdriving\.com$/i.test(fromEmail)) {
    throw new Error('Sender email must use the auth.alertdriving.com domain.')
  }
  if (!/^https:\/\/\S+$/i.test(productUrl)) throw new Error('Product URL must start with https://.')
  if (!isEmailLocale(defaultLocale)) throw new Error('Use a locale such as en or fr-CA.')
  const replyTo = optionalEmail(settings.replyTo, 'Reply-to')
  const supportAddress = optionalEmail(settings.supportAddress, 'Support address')

  const client = await emailAdminClient()
  const { error } = await client
    .from('email_settings')
    .update({
      from_name: fromName,
      from_email: fromEmail,
      reply_to: replyTo,
      product_url: productUrl,
      support_address: supportAddress,
      default_locale: defaultLocale,
      updated_by: updatedBy,
    })
    .eq('organization_id', settings.organizationId)
  if (error) throw await explainEmailDatabaseError(client, error)
}

/** Asks the application email function to send a test to the signed-in administrator. */
export async function sendTestTemplateEmail(input: {
  templateKey: string
  locale: string
  source: 'draft' | 'published'
}): Promise<EmailTestSendResult> {
  const client = await emailAdminClient()
  const { data, error } = await client.functions.invoke('send-application-email', {
    body: {
      operation: 'test',
      templateKey: input.templateKey,
      locale: input.locale,
      source: input.source,
      idempotencyKey: crypto.randomUUID(),
    },
  })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null) as { error?: unknown } | null
      if (body && typeof body.error === 'string' && body.error.trim()) throw new Error(body.error)
    }
    throw new Error(error.message || 'The test email could not be sent.')
  }
  if (!data || typeof data !== 'object') throw new Error('The test email could not be sent.')
  const result = data as Partial<EmailTestSendResult>
  if (result.status !== 'sent') throw new Error('The test email could not be sent.')
  return {
    id: String(result.id ?? ''),
    status: result.status,
    locale: String(result.locale ?? input.locale),
    source: result.source === 'draft' ? 'draft' : 'published',
    replayed: result.replayed === true,
  }
}
