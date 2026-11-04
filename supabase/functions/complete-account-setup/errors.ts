export class SetupError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SetupError'
    this.status = status
  }
}

export class PasswordUnchanged extends SetupError {
  constructor() {
    super(422, 'Could not update the password.')
    this.name = 'PasswordUnchanged'
  }
}
