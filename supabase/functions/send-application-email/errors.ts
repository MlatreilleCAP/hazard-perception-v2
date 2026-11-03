/** Safe to return to the caller and to write in logs. Never include secrets, tokens, or variable values. */
export class ApplicationEmailError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApplicationEmailError'
    this.status = status
  }
}
