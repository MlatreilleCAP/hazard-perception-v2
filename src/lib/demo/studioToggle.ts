export const LIFECYCLE_TOGGLE_REASON =
  'Studio access for this person is managed in Demo Accounts.'

export const GUARD_TOGGLE_REASON =
  'This account is managed by the demo lifecycle, so Studio cannot be turned on here.'

export function isLifecycleRoleGuard(message: string): boolean {
  return message.toLowerCase().includes('cannot be given studio access')
}

export function studioToggleReason(input: {
  role: string
  profileId: string
  lifecycleProfileIds: ReadonlySet<string>
  guardBlocked: boolean
}): string | null {
  if (input.role === 'admin') return null
  if (input.lifecycleProfileIds.has(input.profileId)) return LIFECYCLE_TOGGLE_REASON
  if (input.guardBlocked) return GUARD_TOGGLE_REASON
  return null
}
