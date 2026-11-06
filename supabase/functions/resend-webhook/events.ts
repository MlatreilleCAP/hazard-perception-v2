import { WebhookError } from './errors.ts'

export const MESSAGE_STATUSES = [
  'queued',
  'sending',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
  'suppressed',
] as const

export type MessageStatus = typeof MESSAGE_STATUSES[number]

const RANK: Record<MessageStatus, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  bounced: 4,
  complained: 4,
  failed: 4,
  suppressed: 4,
}

export interface StoredMessage {
  id: string
  status: MessageStatus
  templateVersionId: string
  sentAt: string | null
  deliveredAt: string | null
  bouncedAt: string | null
  complainedAt: string | null
  failedAt: string | null
  suppressedAt: string | null
  errorCode: string | null
  errorMessage: string | null
}

export interface MessagePatch {
  status?: MessageStatus
  sentAt?: string
  deliveredAt?: string
  bouncedAt?: string
  complainedAt?: string
  failedAt?: string
  suppressedAt?: string
  errorCode?: string
  errorMessage?: string
}

interface StatusEvent {
  status: MessageStatus
  stamp: keyof Pick<MessagePatch, 'sentAt' | 'deliveredAt' | 'bouncedAt' | 'complainedAt' | 'failedAt' | 'suppressedAt'>
  current: keyof Pick<StoredMessage, 'sentAt' | 'deliveredAt' | 'bouncedAt' | 'complainedAt' | 'failedAt' | 'suppressedAt'>
  errorCode?: string
  errorMessage?: string
}

const STATUS_EVENTS: Record<string, StatusEvent> = {
  'email.sent': { status: 'sent', stamp: 'sentAt', current: 'sentAt' },
  'email.delivered': { status: 'delivered', stamp: 'deliveredAt', current: 'deliveredAt' },
  'email.bounced': {
    status: 'bounced',
    stamp: 'bouncedAt',
    current: 'bouncedAt',
    errorCode: 'bounced',
    errorMessage: 'The recipient mail server rejected the message.',
  },
  'email.complained': {
    status: 'complained',
    stamp: 'complainedAt',
    current: 'complainedAt',
    errorCode: 'complained',
    errorMessage: 'The recipient reported this message.',
  },
  'email.failed': {
    status: 'failed',
    stamp: 'failedAt',
    current: 'failedAt',
    errorCode: 'failed',
    errorMessage: 'The provider could not send the message.',
  },
  'email.suppressed': {
    status: 'suppressed',
    stamp: 'suppressedAt',
    current: 'suppressedAt',
    errorCode: 'suppressed',
    errorMessage: 'The provider suppressed this message.',
  },
}

export interface ParsedWebhook {
  type: string
  emailId: string | null
  occurredAt: string
}

export function parseWebhook(body: unknown, fallbackIso: string): ParsedWebhook {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new WebhookError(400, 'payload', 'The webhook payload is invalid.')
  }
  const record = body as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type.trim() : ''
  if (!/^[a-z][a-z0-9_.]{0,99}$/.test(type)) {
    throw new WebhookError(400, 'payload', 'The webhook payload is invalid.')
  }
  const data = record.data
  let emailId: string | null = null
  let occurredAt = fallbackIso
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const row = data as Record<string, unknown>
    if (typeof row.email_id === 'string' && row.email_id.trim()) emailId = row.email_id.trim()
    if (typeof row.created_at === 'string' && !Number.isNaN(Date.parse(row.created_at))) {
      occurredAt = new Date(row.created_at).toISOString()
    }
  }
  if (typeof record.created_at === 'string' && occurredAt === fallbackIso && !Number.isNaN(Date.parse(record.created_at))) {
    occurredAt = new Date(record.created_at).toISOString()
  }
  return { type, emailId, occurredAt }
}

export function applyWebhook(message: StoredMessage, event: ParsedWebhook): MessagePatch | null {
  const mapping = STATUS_EVENTS[event.type]
  if (!mapping) return null
  const patch: MessagePatch = {}
  if (RANK[mapping.status] > RANK[message.status]) patch.status = mapping.status
  if (!message[mapping.current]) patch[mapping.stamp] = event.occurredAt
  if (patch.status && mapping.errorCode && !message.errorCode) {
    patch.errorCode = mapping.errorCode
    patch.errorMessage = mapping.errorMessage
  }
  return Object.keys(patch).length > 0 ? patch : null
}
