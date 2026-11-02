export type HookLogReason = 'config' | 'signature' | 'payload' | 'delivery'

/** Safe to return to Supabase Auth and to write to logs. Never include secrets or tokens. */
export class HookError extends Error {
  readonly status: number
  readonly logReason: HookLogReason

  constructor(status: number, logReason: HookLogReason, message: string) {
    super(message)
    this.name = 'HookError'
    this.status = status
    this.logReason = logReason
  }
}
