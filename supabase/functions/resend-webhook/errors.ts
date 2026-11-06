export class WebhookError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'WebhookError'
    this.status = status
    this.code = code
  }
}
