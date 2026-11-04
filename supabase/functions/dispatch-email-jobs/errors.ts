export class DispatchError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'DispatchError'
    this.status = status
    this.code = code
  }
}

export class JobFailure extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable: boolean) {
    super(message)
    this.name = 'JobFailure'
    this.code = code
    this.retryable = retryable
  }
}
