import type { Session, User } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isStudioRole } from '@/lib/auth/roles'
import { getSupabase } from '@/services/supabase'
import {
  signInWithGoogle as startGoogleSignIn,
  signInWithPassword,
  signOut as signOutSession,
  signUpWithPassword,
} from '@/services/auth'
import type { ProfileRole } from '@/types/database'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const role = ref<ProfileRole | null>(null)
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
      return
    }

    const client = getSupabase()
    if (!client) {
      // Local / memory mode: treat signed-in users as authors so studio stays usable.
      role.value = 'author'
      return
    }

    const { data, error } = await client
      .from('profiles')
      .select('role')
      .eq('id', nextUserId)
      .maybeSingle()

    if (token !== profileLoadToken) return

    if (error || !data) {
      role.value = 'demo'
      return
    }

    const nextRole = data.role
    role.value =
      nextRole === 'admin' || nextRole === 'author' || nextRole === 'demo' ? nextRole : 'demo'
  }

  async function initialize(): Promise<void> {
    if (initializePromise) return initializePromise
    initializePromise = (async () => {
      const client = getSupabase()
      if (!client) {
        // Local / memory mode: treat users as authors so studio stays usable offline.
        role.value = 'author'
        ready.value = true
        return
      }

      const { data } = await client.auth.getSession()
      session.value = data.session
      await loadProfile(data.session?.user.id ?? null)

      client.auth.onAuthStateChange((_event, nextSession) => {
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

  async function signUp(
    emailValue: string,
    password: string,
    nextPath: string,
  ): Promise<{ error: string | null; needsSignIn: boolean }> {
    const result = await signUpWithPassword(emailValue, password, nextPath)
    if (result.error) {
      return { error: result.error, needsSignIn: false }
    }
    if (result.session) {
      session.value = result.session
      await loadProfile(result.session.user.id)
      return { error: null, needsSignIn: false }
    }
    if (result.user) {
      const signInError = await signIn(emailValue, password)
      if (signInError) {
        return { error: signInError, needsSignIn: true }
      }
    }
    return { error: null, needsSignIn: !session.value }
  }

  async function signInWithGoogle(nextPath: string): Promise<string | null> {
    return startGoogleSignIn(nextPath)
  }

  async function signOut(): Promise<void> {
    await signOutSession()
    session.value = null
    role.value = null
  }

  return {
    session,
    user,
    userId,
    email,
    role,
    isSignedIn,
    isAdmin,
    isAuthor,
    isDemo,
    canAccessStudio,
    ready,
    initialize,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  }
})
