import { getSupabase } from '@/services/supabase'

export type DemoRequestInput = {
  name: string
  email: string
  company: string
  message?: string
  /** Honeypot — leave empty for humans. */
  website?: string
}

async function invokeErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context
  const body = await context?.json?.().catch(() => null)
  if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
    return (body as { error: string }).error
  }
  return 'The request could not be sent.'
}

export async function submitDemoRequest(input: DemoRequestInput): Promise<void> {
  const client = getSupabase()
  if (!client) throw new Error('The request could not be sent.')

  const body = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    company: input.company.trim(),
    message: input.message?.trim() ?? '',
    website: input.website?.trim() ?? '',
  }

  const { data, error } = await client.functions.invoke('demo-request', { body })
  if (error) throw new Error(await invokeErrorMessage(error))
  if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    const message =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'The request could not be sent.'
    throw new Error(message)
  }
}
