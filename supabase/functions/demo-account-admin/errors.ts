/** Safe to return to the caller. Never include secrets, tokens, or Auth error bodies. */
export class DemoAdminError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'DemoAdminError'
    this.status = status
  }
}

/** Auth already has this email. The message intentionally omits the address. */
export class AuthIdentityExists extends DemoAdminError {
  constructor() {
    super(409, 'An account with this email already exists.')
    this.name = 'AuthIdentityExists'
  }
}
