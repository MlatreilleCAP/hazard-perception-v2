import type { Session, User } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getSupabase } from '@/services/supabase'
import {
  signInWithGoogle as startGoogleSignIn,
  signInWithPassword,
  signOut as signOutSession,
  signUpWithPassword,
} from '@/services/auth'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const ready = ref(false)
  let initializePromise: Promise<void> | null = null

  const user = computed<User | null>(() => session.value?.user ?? null)
  const isSignedIn = computed(() => Boolean(user.value))
  const email = computed(() => user.value?.email ?? null)

  async function initialize(): Promise<void> {
    if (initializePromise) return initializePromise
    initializePromise = (async () => {
      const client = getSupabase()
      if (!client) {
        ready.value = true
        return
      }

      const { data } = await client.auth.getSession()
      session.value = data.session

      client.auth.onAuthStateChange((_event, nextSession) => {
        session.value = nextSession
      })

      ready.value = true
    })()
    return initializePromise
  }

  async function signIn(emailValue: string, password: string): Promise<string | null> {
    const result = await signInWithPassword(emailValue, password)
    session.value = result.session
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
  }

  return {
    session,
    user,
    email,
    isSignedIn,
    ready,
    initialize,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  }
})
