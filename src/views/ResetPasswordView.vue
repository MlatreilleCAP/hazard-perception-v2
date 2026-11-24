<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { MIN_PASSWORD_LENGTH, passwordError } from '@/lib/auth/credentials'
import { setupRequired } from '@/lib/auth/setupAccess'
import { completeAccountSetup } from '@/services/accountSetup'
import { RECOVERY_LINK_ERROR, RECOVERY_NETWORK_ERROR, readRecoveryCallback } from '@/lib/auth/recoveryCallback'
import { clearPasswordRecovery, establishPasswordRecovery, verifyRecoveryCode } from '@/services/auth'
import { getSupabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const state = ref<'checking' | 'code' | 'confirm' | 'invalid' | 'form'>('checking')
const email = ref('')
const code = ref('')
const failureTitle = ref('Reset link expired')
const failureMessage = ref(RECOVERY_LINK_ERROR)
const password = ref('')
const confirmation = ref('')
const showPassword = ref(false)
const showConfirmation = ref(false)
const error = ref<string | null>(null)
const loading = ref(false)
const returning = ref(false)
const finishingSetup = ref(false)

void auth.initialize().then(async () => {
  const callback = readRecoveryCallback(window.location.href)
  email.value = new URL(window.location.href).searchParams.get('email')?.trim() ?? ''
  // A link that already carries a one-time hash still waits for a click.
  // New mail has no hash. The code is typed, so opening the page cannot use it up.
  if (callback.kind === 'token_hash') {
    state.value = 'confirm'
    return
  }
  if (callback.kind === 'none') {
    state.value = 'code'
    return
  }
  await verifyRecovery()
})

async function verifyRecovery(): Promise<void> {
  try {
    const result = await establishPasswordRecovery()
    if (result.status === 'ready') {
      const client = getSupabase()
      const current = client ? (await client.auth.getUser()).data.user : auth.user
      finishingSetup.value = setupRequired(current?.app_metadata)
      state.value = 'form'
    } else {
      failureTitle.value = result.title
      failureMessage.value = result.message
      state.value = 'invalid'
    }
  } catch {
    failureTitle.value = 'Could not verify reset link'
    failureMessage.value = RECOVERY_NETWORK_ERROR
    state.value = 'invalid'
  }
  if (hasRecoveryParams()) {
    await router.replace({ path: '/reset-password' })
  }
}

async function continueReset(): Promise<void> {
  if (state.value !== 'confirm') return
  state.value = 'checking'
  await verifyRecovery()
}

async function submitCode(): Promise<void> {
  if (state.value !== 'code' || loading.value) return
  error.value = null
  const address = email.value.trim()
  const otp = code.value.trim()
  if (!address || !/^[0-9]{6,10}$/.test(otp)) {
    error.value = 'Enter the email and the code from the reset message.'
    return
  }
  loading.value = true
  try {
    const result = await verifyRecoveryCode(address, otp)
    if (result.status === 'ready') {
      const client = getSupabase()
      const current = client ? (await client.auth.getUser()).data.user : auth.user
      finishingSetup.value = setupRequired(current?.app_metadata)
      state.value = 'form'
      return
    }
    error.value = result.message
  } catch {
    error.value = RECOVERY_NETWORK_ERROR
  } finally {
    loading.value = false
  }
}

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

async function handleUpdate(): Promise<void> {
  error.value = null
  const validationError = passwordError(password.value, confirmation.value)
  if (validationError) {
    error.value = validationError
    return
  }

  const chosenPassword = password.value
  loading.value = true
  try {
    if (finishingSetup.value) {
      const result = await completeAccountSetup(chosenPassword)
      if (result.status === 'retry') {
        error.value = 'The password update could not be finished. Submit it again. Training stays locked until this finishes.'
        return
      }
      if (result.status === 'error') {
        error.value = result.message
        return
      }
      clearPasswordRecovery()
      const signedIn = await signInWithNewPassword(chosenPassword)
      if (!signedIn) return
      password.value = ''
      confirmation.value = ''
      await router.replace('/')
      return
    }
    const updateError = await auth.updatePassword(chosenPassword)
    if (updateError) {
      error.value = updateError
      return
    }
    clearPasswordRecovery()
    const stillSignedIn = await auth.restoreSession()
    if (!stillSignedIn) {
      const signedIn = await signInWithNewPassword(chosenPassword)
      if (!signedIn) return
    }
    password.value = ''
    confirmation.value = ''
    await router.replace('/')
  } catch {
    error.value = 'Could not update the password. Try again.'
  } finally {
    loading.value = false
  }
}

async function signInWithNewPassword(chosenPassword: string): Promise<boolean> {
  const address = email.value.trim() || auth.email || ''
  if (!address) {
    error.value = 'Password updated. Sign in with your new password.'
    return false
  }
  await auth.signOut()
  const signInError = await auth.signIn(address, chosenPassword)
  if (signInError) {
    error.value = signInError
    return false
  }
  return true
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
          <h1 v-if="state === 'invalid'">{{ failureTitle }}</h1>
          <h1 v-else>Create a new password</h1>
          <p v-if="state === 'invalid'">{{ failureMessage }}</p>
          <p v-else-if="state === 'form'">Enter and confirm a new password for your account.</p>
          <p v-else-if="state === 'code'">Enter the code from the reset email, then choose a new password.</p>
          <p v-else-if="state === 'confirm'">Continue to choose a new password. This link can only be used once.</p>
          <p v-else>Checking your reset link…</p>
        </div>

        <div v-if="state === 'code'" class="auth-card">
          <form class="auth-form" @submit.prevent="submitCode">
            <label>
              <span>Email</span>
              <input v-model="email" type="email" required autocomplete="username" />
            </label>
            <label>
              <span>Reset code</span>
              <input
                v-model="code"
                type="text"
                required
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="10"
              />
            </label>
            <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
            <button type="submit" class="auth-submit" :disabled="loading">
              {{ loading ? 'Checking…' : 'Continue' }}
            </button>
          </form>
        </div>

        <div v-else-if="state === 'confirm'" class="auth-card">
          <button type="button" class="auth-submit" @click="continueReset">
            Continue
          </button>
        </div>

        <div v-else-if="state === 'form'" class="auth-card">
          <form class="auth-form" @submit.prevent="handleUpdate">
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
              {{ loading ? 'Updating…' : 'Update password' }}
            </button>
          </form>
        </div>

        <p v-if="state === 'invalid'" class="auth-switch">
          <button type="button" :disabled="returning" @click="requestAnother">Request another link</button>
        </p>
      </div>
    </div>
  </div>
</template>
