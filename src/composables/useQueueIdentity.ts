import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  isApprover,
  isManagingEditor,
  nameFromEmail,
} from '@/lib/lesson/queueAssignment'
import { getSupabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'

function metadataName(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as { full_name?: unknown; name?: unknown; display_name?: unknown }
  for (const candidate of [record.full_name, record.name, record.display_name]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
}

/** Signed-in studio user, and whether they review or approve queue lessons. */
export function useQueueIdentity() {
  const auth = useAuthStore()
  const { email, userId, user } = storeToRefs(auth)
  const profileName = ref('')

  const name = computed(() => {
    return (
      profileName.value ||
      metadataName(user.value?.user_metadata) ||
      nameFromEmail(email.value ?? '')
    )
  })

  const canReview = computed(() => isManagingEditor(name.value, email.value ?? ''))
  const canApprove = computed(() => isApprover(name.value, email.value ?? ''))

  async function load(): Promise<void> {
    const id = userId.value
    const client = getSupabase()
    if (!id || !client) return
    const { data } = await client
      .from('profiles')
      .select('display_name')
      .eq('id', id)
      .maybeSingle()
    profileName.value = data?.display_name?.trim() ?? ''
  }

  return { name, email, userId, canReview, canApprove, load }
}
