import { WebhookError } from './errors.ts'

export const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60
const MAX_BODY_BYTES = 256_000

export function assertWebhookBody(body: string): void {
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    throw new WebhookError(413, 'payload', 'The webhook payload is too large.')
  }
}

export function decodeWebhookSecret(secret: string | undefined): Uint8Array {
  const trimmed = secret?.trim() ?? ''
  if (!trimmed) throw new WebhookError(500, 'config', 'Resend webhook is not configured.')
  if (!trimmed.startsWith('whsec_')) {
    throw new WebhookError(500, 'config', 'Resend webhook secret is invalid.')
  }
  try {
    const bytes = Uint8Array.from(atob(trimmed.slice('whsec_'.length)), (char) => char.charCodeAt(0))
    if (bytes.length === 0) throw new Error('empty')
    return bytes
  } catch {
    throw new WebhookError(500, 'config', 'Resend webhook secret is invalid.')
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function signaturesMatch(provided: string, expected: string): boolean {
  const left = new TextEncoder().encode(provided)
  const right = new TextEncoder().encode(expected)
  const length = Math.max(left.length, right.length)
  let diff = left.length === right.length ? 0 : 1
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return diff === 0
}

async function expectedSignature(secret: Uint8Array, signedContent: string): Promise<string> {
  const raw = new Uint8Array(secret.byteLength)
  raw.set(secret)
  const key = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  return bytesToBase64(new Uint8Array(mac))
}

/** Svix manual verification: id.timestamp.body, HMAC-SHA256, v1 signatures, 5-minute window. */
export async function verifyResendWebhook(
  body: string,
  headers: Headers,
  secret: string | undefined,
  nowSeconds: number,
): Promise<void> {
  assertWebhookBody(body)
  const id = headers.get('svix-id')?.trim() ?? ''
  const timestamp = headers.get('svix-timestamp')?.trim() ?? ''
  const signature = headers.get('svix-signature')?.trim() ?? ''
  if (!id || id.length > 255 || !/^[0-9]+$/.test(timestamp) || !signature) {
    throw new WebhookError(401, 'signature', 'Invalid webhook signature.')
  }
  const issuedAt = Number(timestamp)
  if (!Number.isSafeInteger(issuedAt) || Math.abs(nowSeconds - issuedAt) > TIMESTAMP_TOLERANCE_SECONDS) {
    throw new WebhookError(401, 'signature', 'Invalid webhook signature.')
  }

  const expected = await expectedSignature(decodeWebhookSecret(secret), `${id}.${timestamp}.${body}`)
  let valid = false
  for (const part of signature.split(' ')) {
    if (!part.startsWith('v1,')) continue
    if (signaturesMatch(part.slice(3), expected)) valid = true
  }
  if (!valid) throw new WebhookError(401, 'signature', 'Invalid webhook signature.')
}

export async function signResendWebhook(
  body: string,
  id: string,
  timestamp: number,
  secret: string,
): Promise<string> {
  const expected = await expectedSignature(decodeWebhookSecret(secret), `${id}.${timestamp}.${body}`)
  return `v1,${expected}`
}
