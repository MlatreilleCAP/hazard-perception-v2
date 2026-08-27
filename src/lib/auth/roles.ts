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
