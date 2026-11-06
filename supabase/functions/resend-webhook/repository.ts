import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { WebhookError } from './errors.ts'
import type { MessagePatch, MessageStatus, StoredMessage } from './events.ts'
import { MESSAGE_STATUSES } from './events.ts'
import type { WebhookDeps } from './handler.ts'

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new WebhookError(500, 'config', 'Resend webhook is not configured.')
  return value
}

function asStatus(value: unknown): MessageStatus {
  const status = String(value)
  if ((MESSAGE_STATUSES as readonly string[]).includes(status)) return status as MessageStatus
  return 'sent'
}

function asMessage(row: Record<string, unknown>): StoredMessage {
  return {
    id: String(row.id),
    status: asStatus(row.status),
    templateVersionId: String(row.template_version_id ?? ''),
    sentAt: row.sent_at ? String(row.sent_at) : null,
    deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
    bouncedAt: row.bounced_at ? String(row.bounced_at) : null,
    complainedAt: row.complained_at ? String(row.complained_at) : null,
    failedAt: row.failed_at ? String(row.failed_at) : null,
    suppressedAt: row.suppressed_at ? String(row.suppressed_at) : null,
    errorCode: row.error_code ? String(row.error_code) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
  }
}

const PATCH_COLUMNS: Record<keyof MessagePatch, string> = {
  status: 'status',
  sentAt: 'sent_at',
  deliveredAt: 'delivered_at',
  bouncedAt: 'bounced_at',
  complainedAt: 'complained_at',
  failedAt: 'failed_at',
  suppressedAt: 'suppressed_at',
  errorCode: 'error_code',
  errorMessage: 'error_message',
}

export function createWebhookDeps(): WebhookDeps {
  const url = requiredEnv('SUPABASE_URL')
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    now: () => Date.now(),
    secret: () => Deno.env.get('RESEND_WEBHOOK_SECRET'),
    async hasEvent(id) {
      const { data, error } = await service
        .from('email_webhook_events')
        .select('id')
        .eq('id', id)
        .maybeSingle()
      if (error) throw new WebhookError(500, 'webhook', 'Resend webhook failed.')
      return Boolean(data)
    },
    async findMessage(resendId) {
      const { data, error } = await service
        .from('email_messages')
        .select('id, status, template_version_id, sent_at, delivered_at, bounced_at, complained_at, failed_at, suppressed_at, error_code, error_message')
        .eq('resend_id', resendId)
        .maybeSingle()
      if (error) throw new WebhookError(500, 'webhook', 'Resend webhook failed.')
      return data ? asMessage(data as Record<string, unknown>) : null
    },
    async saveMessage(id, patch) {
      const row: Record<string, unknown> = {}
      for (const [key, column] of Object.entries(PATCH_COLUMNS)) {
        const value = patch[key as keyof MessagePatch]
        if (value !== undefined) row[column] = value
      }
      const { error } = await service.from('email_messages').update(row).eq('id', id)
      if (error) throw new WebhookError(500, 'webhook', 'Resend webhook failed.')
    },
    async recordEvent(input) {
      const { error } = await service.from('email_webhook_events').insert({
        id: input.id,
        event_type: input.type,
        resend_id: input.resendId,
        message_id: input.messageId,
      })
      if (!error) return true
      if (error.code === '23505') return false
      throw new WebhookError(500, 'webhook', 'Resend webhook failed.')
    },
  }
}
