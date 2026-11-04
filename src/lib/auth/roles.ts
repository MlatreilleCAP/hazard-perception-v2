import type { ProfileRole } from '@/types/database'

const PROFILE_ROLES: readonly ProfileRole[] = ['admin', 'author', 'demo', 'sales', 'unprovisioned']

export function profileRole(value: unknown): ProfileRole {
  return PROFILE_ROLES.includes(value as ProfileRole) ? (value as ProfileRole) : 'unprovisioned'
}

export function isStudioRole(role: ProfileRole | null | undefined): boolean {
  return role === 'admin' || role === 'author'
}

/** Administrators and sales can open Demo Accounts. Sales cannot open the rest of Studio. */
export function canManageDemoAccounts(role: ProfileRole | null | undefined): boolean {
  return role === 'admin' || role === 'sales'
}

export function salesOnlyPathAllowed(path: string): boolean {
  return (
    path === '/' ||
    path === '/player' ||
    path.startsWith('/player/') ||
    path === '/studio/people' ||
    path.startsWith('/studio/people/') ||
    path === '/auth/callback' ||
    path === '/login' ||
    path === '/setup-account'
  )
}

export function canEditOwnedContent(
  role: ProfileRole | null | undefined,
  ownerId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!role || !userId) return false
  if (role === 'admin') return true
  if (role === 'author') return Boolean(ownerId) && ownerId === userId
  return false
}

/**
 * Administrators, Steven Turney, and Matt Latreille can edit published content.
 * Owners and assigned editors can edit unpublished activities and stand alone videos.
 */
export function canEditLessonContent(
  role: ProfileRole | null | undefined,
  ownerId: string | null | undefined,
  userId: string | null | undefined,
  published: boolean,
  canEditOthers: boolean,
  canEditPublished = false,
): boolean {
  if (!role || !userId) return false
  if (role === 'admin' || canEditPublished) return true
  if (published || role !== 'author') return false
  if (ownerId && ownerId === userId) return true
  return canEditOthers
}

export function canRemoveLessonContent(
  role: ProfileRole | null | undefined,
  ownerId: string | null | undefined,
  userId: string | null | undefined,
  published: boolean,
): boolean {
  if (!role || !userId) return false
  if (role === 'admin') return true
  if (published) return false
  return Boolean(ownerId) && ownerId === userId
}

export function contentReadonlyMessage(
  kind: 'lesson' | 'scenario' | 'video',
  published: boolean,
): string {
  const noun = kind === 'video' ? 'stand alone video' : kind
  if (published) {
    return `This ${noun} is published and locked. Only Steven Turney, Matt Latreille, or an administrator can edit it.`
  }
  return `View only — you can open this ${noun}, but only the owner, an assigned editor, or an administrator can edit it.`
}
