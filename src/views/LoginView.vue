<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { safeNextPath } from '@/app/safeNextPath'
import { isEmailAddress, MIN_PASSWORD_LENGTH } from '@/lib/auth/credentials'
import { useAuthStore } from '@/stores/authStore'

type Mode = 'signin' | 'recover'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const nextPath = computed(() => safeNextPath(String(route.query.next ?? '')) ?? '/')
if (route.query.mode === 'signup') {
  const query = { ...route.query }
  delete query.mode
  void router.replace({ path: '/login', query })
}
const mode = ref<Mode>(initialMode())
const email = ref('')
const password = ref('')
const error = ref<string | null>(initialError())
const info = ref<string | null>(
  route.query.reset === 'success'
    ? 'Password updated. Sign in with your new password.'
    : route.query.session === 'refreshed'
      ? 'Sign in again to continue.'
      : null,
)
const loading = ref(false)

function initialMode(): Mode {
  if (route.query.mode === 'recover') return 'recover'
  return 'signin'
}

function initialError(): string | null {
  if (route.query.error === 'reset_link_invalid') {
    return 'This reset link is invalid or has expired. Request another one below.'
  }
  if (route.query.error === 'auth_callback_failed') {
    return 'Sign-in link expired or failed. Please try again.'
  }
  return null
}

const title = computed(() => (mode.value === 'recover' ? 'Reset your password' : 'Welcome back'))
const subtitle = computed(() =>
  mode.value === 'recover'
    ? "Enter your email address and we'll send you a link to reset your password."
    : 'Sign in to access the demo.',
)
const submitLabel = computed(() => (loading.value ? 'Please wait…' : 'Sign in'))
const resetLabel = computed(() => (loading.value ? 'Sending…' : 'Send reset link'))

async function handleEmailAuth(): Promise<void> {
  loading.value = true
  error.value = null
  info.value = null

  try {
    if (mode.value === 'signin') {
      const signInError = await auth.signIn(email.value, password.value)
      if (signInError) {
        error.value = signInError
        return
      }
      await router.push(nextPath.value)
    }
  } finally {
    loading.value = false
  }
}

function setMode(next: Mode): void {
  mode.value = next
  error.value = null
  info.value = null
}

async function handleResetRequest(): Promise<void> {
  error.value = null
  info.value = null
  if (!isEmailAddress(email.value)) {
    error.value = 'Enter a valid email address.'
    return
  }

  loading.value = true
  try {
    const resetError = await auth.requestPasswordReset(email.value)
    if (resetError) {
      error.value = resetError
      return
    }
    info.value =
      'If an account exists for that email, we sent a link to reset your password.'
  } catch {
    error.value = 'Could not send the reset link. Try again.'
  } finally {
    loading.value = false
  }
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
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </div>

        <div class="auth-card">
          <form
            v-if="mode === 'recover'"
            class="auth-form"
            novalidate
            @submit.prevent="handleResetRequest"
          >
            <label>
              <span>Email</span>
              <input
                v-model="email"
                type="email"
                required
                autocomplete="email"
                placeholder="you@company.com"
              />
            </label>

            <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
            <p v-if="info" class="auth-info" role="status">{{ info }}</p>

            <button type="submit" class="auth-submit" :disabled="loading">
              {{ resetLabel }}
            </button>
          </form>

          <form v-else class="auth-form" @submit.prevent="handleEmailAuth">
            <label>
              <span>Email</span>
              <input
                v-model="email"
                type="email"
                required
                autocomplete="email"
                placeholder="you@company.com"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                v-model="password"
                type="password"
                required
                :minlength="MIN_PASSWORD_LENGTH"
                autocomplete="current-password"
                placeholder="••••••••"
              />
            </label>
            <button
              type="button"
              class="auth-forgot"
              @click="setMode('recover')"
            >
              Forgot password?
            </button>

            <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
            <p v-if="info" class="auth-info" role="status">{{ info }}</p>

            <button type="submit" class="auth-submit" :disabled="loading">
              {{ submitLabel }}
            </button>
          </form>
        </div>

        <p v-if="mode === 'recover'" class="auth-switch">
          <button type="button" @click="setMode('signin')">Back to login</button>
        </p>
      </div>
    </div>
  </div>
</template>
