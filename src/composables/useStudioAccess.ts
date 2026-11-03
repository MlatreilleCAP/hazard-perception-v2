import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { canEditLessonContent, canEditOwnedContent, canRemoveLessonContent } from '@/lib/auth/roles'
import { canEditPublishedContent } from '@/lib/lesson/queueAssignment'
import { useAuthStore } from '@/stores/authStore'

function metadataName(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as { full_name?: unknown; name?: unknown; display_name?: unknown }
  for (const candidate of [record.full_name, record.name, record.display_name]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
}

/** Studio access and ownership helpers for authoring views. */
export function useStudioAccess() {
  const auth = useAuthStore()
  const { role, userId, email, displayName, user, canAccessStudio, isAdmin, isAuthor, canEditOthers } =
    storeToRefs(auth)

  const canEditPublished = computed(() =>
    canEditPublishedContent(
      displayName.value.trim() || metadataName(user.value?.user_metadata),
      email.value ?? '',
    ),
  )

  const canCreate = computed(() => canAccessStudio.value)

  function canEdit(ownerId: string | null | undefined): boolean {
    return canEditOwnedContent(role.value, ownerId, userId.value)
  }

  function canEditLesson(ownerId: string | null | undefined, published: boolean): boolean {
    return canEditLessonContent(
      role.value,
      ownerId,
      userId.value,
      published,
      canEditOthers.value,
      canEditPublished.value,
    )
  }

  function canRemoveLesson(ownerId: string | null | undefined, published: boolean): boolean {
    return canRemoveLessonContent(role.value, ownerId, userId.value, published)
  }

  return {
    role,
    userId,
    canAccessStudio,
    canCreate,
    isAdmin,
    isAuthor,
    canEditOthers,
    canEdit,
    canEditLesson,
    canRemoveLesson,
  }
}
