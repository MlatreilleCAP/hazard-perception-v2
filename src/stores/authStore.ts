import type { Session, User } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isStudioRole } from '@/lib/auth/roles'
import { getSupabase } from '@/services/supabase'
import {
  markPasswordRecovery,
  requestPasswordReset as sendPasswordReset,
  signInWithGoogle as startGoogleSignIn,
  signInWithPassword,
  signOut as signOutSession,
  updatePassword as changePassword,
} from '@/services/auth'
import type { ProfileRole } from '@/types/database'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const role = ref<ProfileRole | null>(null)
  const displayName = ref('')
  const canEditOthers = ref(false)
  const ready = ref(false)
  let initializePromise: Promise<void> | null = null
  let profileLoadToken = 0

  const user = computed<User | null>(() => session.value?.user ?? null)
  const userId = computed(() => user.value?.id ?? null)
  const isSignedIn = computed(() => Boolean(user.value))
  const email = computed(() => user.value?.email ?? null)
  const isAdmin = computed(() => role.value === 'admin')
  const isAuthor = computed(() => role.value === 'author')
  const isDemo = computed(() => role.value === 'demo')
  const canAccessStudio = computed(() => isStudioRole(role.value))

  async function loadProfile(nextUserId: string | null): Promise<void> {
    const token = ++profileLoadToken
    if (!nextUserId) {
      role.value = null
      displayName.value = ''
      canEditOthers.value = false
      return
    }

    const client = getSupabase()
    if (!client) {
      // Local / memory mode: treat signed-in users as authors so studio stays usable.
      role.value = 'author'
      displayName.value = ''
      canEditOthers.value = false
      return
    }

    const { data, error } = await client
      .from('profiles')
      .select('role, can_edit_others, display_name')
      .eq('id', nextUserId)
      .maybeSingle()

    if (token !== profileLoadToken) return

    if (error || !data) {
      const fallback = await client
        .from('profiles')
        .select('role')
        .eq('id', nextUserId)
        .maybeSingle()
      if (token !== profileLoadToken) return
      if (fallback.error || !fallback.data) {
        role.value = 'demo'
        displayName.value = ''
        canEditOthers.value = false
        return
      }
      const fallbackRole = fallback.data.role
      role.value =
        fallbackRole === 'admin' || fallbackRole === 'author' || fallbackRole === 'demo'
          ? fallbackRole
          : 'demo'
      displayName.value = ''
      canEditOthers.value = false
      return
    }

    const nextRole = data.role
    role.value =
      nextRole === 'admin' || nextRole === 'author' || nextRole === 'demo' ? nextRole : 'demo'
    displayName.value = data.display_name?.trim() ?? ''
    canEditOthers.value = data.can_edit_others === true
  }

  async function initialize(): Promise<void> {
    if (initializePromise) return initializePromise
    initializePromise = (async () => {
      const client = getSupabase()
      if (!client) {
        // Local / memory mode: treat users as authors so studio stays usable offline.
        role.value = 'author'
        displayName.value = ''
        canEditOthers.value = false
        ready.value = true
        return
      }

      const { data } = await client.auth.getSession()
      session.value = data.session
      await loadProfile(data.session?.user.id ?? null)

      client.auth.onAuthStateChange((event, nextSession) => {
        if (event === 'PASSWORD_RECOVERY') markPasswordRecovery()
        session.value = nextSession
        void loadProfile(nextSession?.user.id ?? null)
      })

      ready.value = true
    })()
    return initializePromise
  }

  async function signIn(emailValue: string, password: string): Promise<string | null> {
    const result = await signInWithPassword(emailValue, password)
    session.value = result.session
    await loadProfile(result.session?.user.id ?? null)
    return result.error
  }

  async function signInWithGoogle(nextPath: string): Promise<string | null> {
    return startGoogleSignIn(nextPath)
  }

  async function signOut(): Promise<void> {
    await signOutSession()
    session.value = null
    role.value = null
    displayName.value = ''
    canEditOthers.value = false
  }

  async function requestPasswordReset(emailValue: string): Promise<string | null> {
    return sendPasswordReset(emailValue)
  }

  async function updatePassword(password: string): Promise<string | null> {
    return changePassword(password)
  }

  return {
    session,
    user,
    userId,
    email,
    role,
    displayName,
    isSignedIn,
    isAdmin,
    isAuthor,
    isDemo,
    canEditOthers,
    canAccessStudio,
    ready,
    initialize,
    signIn,
    signInWithGoogle,
    signOut,
    requestPasswordReset,
    updatePassword,
  }
})
