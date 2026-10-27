import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { canEditLessonContent, canEditOwnedContent, canRemoveLessonContent } from '@/lib/auth/roles'
import { useAuthStore } from '@/stores/authStore'

/** Studio access and ownership helpers for authoring views. */
export function useStudioAccess() {
  const auth = useAuthStore()
  const { role, userId, canAccessStudio, isAdmin, isAuthor, canEditOthers } = storeToRefs(auth)

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
