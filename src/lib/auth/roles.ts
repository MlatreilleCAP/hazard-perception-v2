import type { ProfileRole } from '@/types/database'

export function isStudioRole(role: ProfileRole | null | undefined): boolean {
  return role === 'admin' || role === 'author'
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

/** Admins can edit any lesson. Assigned authors can edit unpublished lessons they do not own. */
export function canEditLessonContent(
  role: ProfileRole | null | undefined,
  ownerId: string | null | undefined,
  userId: string | null | undefined,
  published: boolean,
  canEditOthers: boolean,
): boolean {
  if (!role || !userId) return false
  if (role === 'admin') return true
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
    return `This ${noun} is published and locked. Only an administrator can edit it.`
  }
  return `View only — you can open this ${noun}, but only the owner, an assigned editor, or an administrator can edit it.`
}
