export const SETUP_FAILURE_CATEGORIES = ['uri', 'connect', 'lock', 'cutoff'] as const

export type SetupFailureCategory = (typeof SETUP_FAILURE_CATEGORIES)[number]

export class SetupError extends Error {
  readonly status: number
  readonly category?: SetupFailureCategory

  constructor(status: number, message: string, category?: SetupFailureCategory) {
    super(message)
    this.name = 'SetupError'
    this.status = status
    this.category = category
  }
}
