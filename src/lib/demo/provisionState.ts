const SAFE_MESSAGES = new Set([
  'Authentication required.',
  'Administrator access is required.',
  'Only admins can list demo accounts',
  'Administrator is not a member of this organization',
  'Organization not found',
  'An email address is required.',
  'The display name is not valid.',
  'An expiry is required.',
  'An organization is required.',
  'Demo access starts immediately.',
  'This email already has a demo account.',
  'An account with this email already exists.',
  'This email is already being provisioned.',
  'The demo account could not be created.',
  'The demo account could not be created. Studio access stays off until provisioning is retried.',
  'The demo account could not be started.',
  'The demo account could not be extended.',
  'The demo account could not be deactivated.',
  'The deactivation reason must be 500 characters or fewer.',
  'The caller is taken from the signed-in session.',
])

export function isSetupIncomplete(message: string): boolean {
  return (
    message.includes('Studio access stays off until provisioning is retried') ||
    message.includes('This email is already being provisioned.')
  )
}

export function presentDemoError(message: string): string {
  const text = message.trim()
  if (SAFE_MESSAGES.has(text)) {
    if (text === 'Only admins can list demo accounts') return 'Only administrators can view demo accounts.'
    if (text === 'Administrator is not a member of this organization') {
      return 'You are not a member of this organization.'
    }
    if (text === 'An account with this email already exists.') {
      return 'An account with this email already exists. Demo accounts can only be created for a new email address.'
    }
    return text
  }
  if (/only admins can list demo accounts/i.test(text)) return 'Only administrators can view demo accounts.'
  if (/not a member of this organization/i.test(text)) return 'You are not a member of this organization.'
  if (/account_access_blocked/i.test(text)) return 'Your account cannot manage demo accounts right now.'
  if (
    /choose start, extend, or deactivate\./i.test(text) ||
    (/choose start, extend, deactivate\./i.test(text) && !/provision/i.test(text))
  ) {
    return 'Creating demo accounts is not available on this server yet.'
  }
  if (/does not exist|schema cache|pgrst202/i.test(text)) {
    return 'Demo accounts are not available on this server yet.'
  }
  return 'The demo account could not be changed.'
}
