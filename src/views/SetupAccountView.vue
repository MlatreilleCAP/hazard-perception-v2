<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { MIN_PASSWORD_LENGTH, passwordError } from '@/lib/auth/credentials'
import { RECOVERY_LINK_ERROR, RECOVERY_NETWORK_ERROR } from '@/lib/auth/recoveryCallback'
import { setupRequired } from '@/lib/auth/setupAccess'
import { completeAccountSetup } from '@/services/accountSetup'
import { clearPasswordRecovery, establishPasswordRecovery } from '@/services/auth'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const state = ref<'checking' | 'invalid' | 'form' | 'success'>('checking')
const failureTitle = ref('Setup link expired')
const failureMessage = ref(RECOVERY_LINK_ERROR)
const password = ref('')
const confirmation = ref('')
const showPassword = ref(false)
const showConfirmation = ref(false)
const error = ref<string | null>(null)
const loading = ref(false)
const returning = ref(false)

void auth.initialize().then(async () => {
  try {
    const result = await establishPasswordRecovery()
    if (state.value === 'success') return
    if (result.status === 'ready' || setupRequired(auth.user?.app_metadata)) {
      state.value = 'form'
    } else {
      failureTitle.value = result.title
      failureMessage.value = result.message
      state.value = 'invalid'
    }
  } catch {
    failureTitle.value = 'Could not verify setup link'
    failureMessage.value = RECOVERY_NETWORK_ERROR
    state.value = 'invalid'
  }
  if (hasRecoveryParams()) {
    await router.replace({ path: '/setup-account' })
  }
})

function hasRecoveryParams(): boolean {
  return Boolean(
    route.query.code ||
      route.query.token_hash ||
      route.query.error ||
      route.query.error_code ||
      route.query.error_description ||
      route.hash,
  )
}

async function handleSetup(): Promise<void> {
  if (state.value === 'success' || loading.value) return
  error.value = null
  const validationError = passwordError(password.value, confirmation.value)
  if (validationError) {
    error.value = validationError
    return
  }
  loading.value = true
  try {
    const result = await completeAccountSetup(password.value)
    password.value = ''
    confirmation.value = ''
    if (result.status === 'retry') {
      error.value = 'The password update could not be finished. Submit it again. Training stays locked until this finishes.'
      return
    }
    if (result.status === 'error') {
      error.value = result.message
      return
    }
    state.value = 'success'
    clearPasswordRecovery()
    await auth.signOut().catch(() => undefined)
  } catch {
    if (state.value === 'success') return
    error.value = 'Could not create the password. Try again.'
  } finally {
    if (state.value !== 'success') loading.value = false
  }
}

async function returnToLogin(): Promise<void> {
  returning.value = true
  clearPasswordRecovery()
  await auth.signOut().catch(() => undefined)
  await router.replace({ path: '/login', query: { reset: 'success' } })
}

async function requestAnother(): Promise<void> {
  returning.value = true
  clearPasswordRecovery()
  await auth.signOut()
  await router.push({ path: '/login', query: { mode: 'recover' } })
}
</script>

<template>
  <div class="auth-screen">
    <div class="auth-grid" aria-hidden="true" />
    <div class="auth-blob-pink" aria-hidden="true" />
    <div class="auth-blob-slate" aria-hidden="true" />
    <div class="auth-content">
      <div class="auth-panel">
        <div class="auth-header">
          <RouterLink to="/" class="auth-logo">
            <img src="/AD_Logo.svg" alt="AlertDriving" />
          </RouterLink>
          <h1 v-if="state === 'success'">Password created</h1>
          <h1 v-else-if="state === 'invalid'">{{ failureTitle }}</h1>
          <h1 v-else>Create your password</h1>
          <p v-if="state === 'success'">You can sign in with your new password.</p>
          <p v-else-if="state === 'invalid'">{{ failureMessage }}</p>
          <p v-else-if="state === 'form'">Enter and confirm a password for your Inroads demo account.</p>
          <p v-else>Checking your setup link…</p>
        </div>

        <div v-if="state === 'form'" class="auth-card">
          <form class="auth-form" @submit.prevent="handleSetup">
            <label>
              <span>New password</span>
              <div class="auth-password">
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  :minlength="MIN_PASSWORD_LENGTH"
                  autocomplete="new-password"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  class="auth-password-toggle"
                  :aria-pressed="showPassword"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  @click="showPassword = !showPassword"
                >
                  {{ showPassword ? 'Hide' : 'Show' }}
                </button>
              </div>
            </label>
            <label>
              <span>Confirm new password</span>
              <div class="auth-password">
                <input
                  v-model="confirmation"
                  :type="showConfirmation ? 'text' : 'password'"
                  required
                  :minlength="MIN_PASSWORD_LENGTH"
                  autocomplete="new-password"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  class="auth-password-toggle"
                  :aria-pressed="showConfirmation"
                  :aria-label="showConfirmation ? 'Hide password confirmation' : 'Show password confirmation'"
                  @click="showConfirmation = !showConfirmation"
                >
                  {{ showConfirmation ? 'Hide' : 'Show' }}
                </button>
              </div>
            </label>
            <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
            <button type="submit" class="auth-submit" :disabled="loading">
              {{ loading ? 'Saving…' : 'Set up account' }}
            </button>
          </form>
        </div>

        <div v-else-if="state === 'success'" class="auth-card">
          <button type="button" class="auth-submit" :disabled="returning" @click="returnToLogin">
            Back to login
          </button>
        </div>

        <p v-if="state === 'invalid'" class="auth-switch">
          <button type="button" :disabled="returning" @click="requestAnother">Forgot password</button>
        </p>
      </div>
    </div>
  </div>
</template>
