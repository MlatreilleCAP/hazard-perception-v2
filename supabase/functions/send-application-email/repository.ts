import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { authorizeCaller, type AdminCaller } from './authorize.ts'
import { ApplicationEmailError } from './errors.ts'
import type { SendApplicationEmailDeps, StoredMessage } from './handler.ts'
import { applicationMessageInsert, type NewApplicationMessage } from './messages.ts'
import type { TemplateVariable } from './render.ts'
import { formatFromAddress, sendViaResend } from './resend.ts'
import type { EmailSettingsRecord, EmailTemplateRecord, EmailVersionRecord } from './select.ts'

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new ApplicationEmailError(500, 'Email sending is not configured.')
  return value
}

function userClient(url: string, anonKey: string, authorization: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function parseVariables(value: unknown): TemplateVariable[] {
  if (!Array.isArray(value)) return []
  const variables: TemplateVariable[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.key !== 'string') continue
    variables.push({
      key: row.key,
      required: row.required === true,
      sample: typeof row.sample === 'string' ? row.sample : '',
    })
  }
  return variables
}

function asVersionStatus(value: string): EmailVersionRecord['status'] | null {
  if (value === 'draft' || value === 'published' || value === 'archived') return value
  return null
}

function asMessage(row: Record<string, unknown>): StoredMessage {
  return {
    id: String(row.id),
    status: String(row.status ?? ''),
    resendId: row.resend_id ? String(row.resend_id) : null,
    locale: String(row.locale ?? ''),
    requestedBy: String(row.requested_by ?? ''),
    organizationId: String(row.organization_id ?? ''),
    templateId: String(row.template_id ?? ''),
    toEmail: String(row.to_email ?? ''),
  }
}

export function createApplicationEmailDeps(authorization: string | null): SendApplicationEmailDeps {
  const url = requiredEnv('SUPABASE_URL')
  const anonKey = requiredEnv('SUPABASE_ANON_KEY')
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = requiredEnv('RESEND_API_KEY')
  const header = authorization ?? ''
  const callerClient = userClient(url, anonKey, header)
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    authorize() {
      return authorizeCaller(authorization, {
        async getUser() {
          const { data, error } = await callerClient.auth.getUser()
          if (error || !data.user) return null
          return { id: data.user.id, email: data.user.email ?? null }
        },
        async isAdmin() {
          const { data, error } = await callerClient.rpc('is_admin')
          return !error && data === true
        },
      })
    },

    async loadCatalog(caller: AdminCaller, organizationId: string | null, templateKey: string) {
      const memberships = await callerClient
        .from('organization_members')
        .select('organization_id')
        .eq('profile_id', caller.userId)
      if (memberships.error) throw new ApplicationEmailError(500, 'Email sending failed.')
      const organizationIds = (memberships.data ?? []).map((row) => String(row.organization_id))
      if (organizationId && !organizationIds.includes(organizationId)) {
        throw new ApplicationEmailError(403, 'Administrator access is required.')
      }
      if (!organizationId && organizationIds.length !== 1) {
        throw new ApplicationEmailError(400, 'Choose an organization.')
      }
      const selected = organizationId ?? organizationIds[0]

      const settingsResult = await callerClient
        .from('email_settings')
        .select('organization_id, from_name, from_email, reply_to, default_locale')
        .eq('organization_id', selected)
        .maybeSingle()
      if (settingsResult.error) throw new ApplicationEmailError(500, 'Email sending failed.')
      if (!settingsResult.data) throw new ApplicationEmailError(400, 'Email settings were not found.')
      const settings: EmailSettingsRecord = {
        organizationId: String(settingsResult.data.organization_id),
        fromName: String(settingsResult.data.from_name ?? ''),
        fromEmail: String(settingsResult.data.from_email ?? ''),
        replyTo: settingsResult.data.reply_to ? String(settingsResult.data.reply_to) : null,
        defaultLocale: String(settingsResult.data.default_locale ?? 'en'),
      }

      const templateResult = await callerClient
        .from('email_templates')
        .select('id, organization_id, key, source, sendable')
        .eq('organization_id', selected)
        .eq('key', templateKey)
        .maybeSingle()
      if (templateResult.error) throw new ApplicationEmailError(500, 'Email sending failed.')
      if (!templateResult.data) throw new ApplicationEmailError(400, 'The template was not found.')
      const source = templateResult.data.source === 'auth_hook' ? 'auth_hook' : 'application'
      const template: EmailTemplateRecord = {
        id: String(templateResult.data.id),
        organizationId: String(templateResult.data.organization_id),
        key: String(templateResult.data.key),
        source,
        sendable: templateResult.data.sendable === true,
      }

      const versionsResult = await callerClient
        .from('email_template_versions')
        .select('id, template_id, locale, status, subject, html_body, text_body, variables')
        .eq('template_id', template.id)
      if (versionsResult.error) throw new ApplicationEmailError(500, 'Email sending failed.')
      const versions: EmailVersionRecord[] = []
      for (const row of versionsResult.data ?? []) {
        const status = asVersionStatus(String(row.status ?? ''))
        if (!status) continue
        versions.push({
          id: String(row.id),
          templateId: String(row.template_id),
          locale: String(row.locale ?? ''),
          status,
          subject: String(row.subject ?? ''),
          htmlBody: String(row.html_body ?? ''),
          textBody: String(row.text_body ?? ''),
          variables: parseVariables(row.variables),
        })
      }
      return { settings, template, versions, job: null }
    },

    async findMessage(idempotencyKey: string) {
      const { data, error } = await service
        .from('email_messages')
        .select('id, status, resend_id, locale, requested_by, organization_id, template_id, to_email')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (error) throw new ApplicationEmailError(500, 'Email sending failed.')
      return data ? asMessage(data) : null
    },

    async createMessage(row: NewApplicationMessage) {
      const { data, error } = await service
        .from('email_messages')
        .insert(applicationMessageInsert(row))
        .select('id, status, resend_id, locale, requested_by, organization_id, template_id, to_email')
        .single()
      if (error) {
        if (error.code === '23505') throw new ApplicationEmailError(409, 'This idempotency key was already used.')
        throw new ApplicationEmailError(500, 'Email sending failed.')
      }
      return asMessage(data)
    },

    async markSent(message: StoredMessage, resendId: string) {
      const { error } = await service
        .from('email_messages')
        .update({
          status: 'sent',
          resend_id: resendId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', message.id)
        .eq('organization_id', message.organizationId)
      if (error) throw new ApplicationEmailError(500, 'Email sending failed.')
    },

    async markFailed(message: StoredMessage) {
      const { error } = await service
        .from('email_messages')
        .update({
          status: 'failed',
          error_code: 'delivery',
          error_message: 'Email delivery failed.',
        })
        .eq('id', message.id)
        .eq('organization_id', message.organizationId)
      if (error) throw new ApplicationEmailError(500, 'Email sending failed.')
    },

    deliver(input) {
      return sendViaResend({
        apiKey: resendKey,
        from: formatFromAddress(input.fromName, input.fromEmail),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo,
        idempotencyKey: input.idempotencyKey,
      })
    },
  }
}
