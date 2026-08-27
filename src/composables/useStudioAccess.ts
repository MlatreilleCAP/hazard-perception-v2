import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { canEditOwnedContent } from '@/lib/auth/roles'
import { useAuthStore } from '@/stores/authStore'

/** Studio access and ownership helpers for authoring views. */
export function useStudioAccess() {
  const auth = useAuthStore()
  const { role, userId, canAccessStudio, isAdmin, isAuthor } = storeToRefs(auth)

  const canCreate = computed(() => canAccessStudio.value)

  function canEdit(ownerId: string | null | undefined): boolean {
    return canEditOwnedContent(role.value, ownerId, userId.value)
  }

  return {
    role,
    userId,
    canAccessStudio,
    canCreate,
    isAdmin,
    isAuthor,
    canEdit,
  }
}
