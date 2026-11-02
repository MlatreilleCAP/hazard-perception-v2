import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { HookError } from './errors.ts'

const SECRET_PATTERN = /^[A-Za-z0-9+/_-]{16,}={0,2}$/

/**
 * Dashboard secrets look like `v1,whsec_<base64>`. Standard Webhooks wants the
 * base64 portion. Separate secrets with `|` while rotating.
 */
export function decodeHookSecrets(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    throw new HookError(500, 'config', 'Send email hook secret is not configured.')
  }

  const secrets = raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^v1,whsec_/, ''))

  if (secrets.length === 0 || secrets.some((secret) => !SECRET_PATTERN.test(secret))) {
    throw new HookError(500, 'config', 'Send email hook secret is invalid.')
  }

  return secrets
}

export function verifySendEmailHook(payload: string, headers: Headers, secrets: string[]): unknown {
  const received = Object.fromEntries(headers.entries())
  let constructed = 0

  for (const secret of secrets) {
    let webhook: Webhook
    try {
      webhook = new Webhook(secret)
    } catch {
      continue
    }
    constructed += 1

    try {
      return webhook.verify(payload, received)
    } catch {
      // Try the next secret. A mismatch is expected while a key is rotating.
    }
  }

  if (constructed === 0) {
    throw new HookError(500, 'config', 'Send email hook secret is invalid.')
  }

  throw new HookError(401, 'signature', 'Invalid webhook signature.')
}
