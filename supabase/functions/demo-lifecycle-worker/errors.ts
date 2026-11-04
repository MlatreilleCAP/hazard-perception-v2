export class LifecycleWorkerError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'LifecycleWorkerError'
    this.status = status
  }
}
