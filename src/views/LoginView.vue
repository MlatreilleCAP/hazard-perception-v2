<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { safeNextPath } from '@/app/safeNextPath'
import { useAuthStore } from '@/stores/authStore'

type Mode = 'signin' | 'signup'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const nextPath = computed(() => safeNextPath(String(route.query.next ?? '')) ?? '/')
const mode = ref<Mode>(route.query.mode === 'signup' ? 'signup' : 'signin')
const email = ref('')
const password = ref('')
const error = ref<string | null>(
  route.query.error === 'auth_callback_failed'
    ? 'Sign-in link expired or failed. Please try again.'
    : null,
)
const info = ref<string | null>(null)
const loading = ref(false)

const title = computed(() =>
  mode.value === 'signin' ? 'Welcome back' : 'Create your account',
)
const subtitle = computed(() =>
  mode.value === 'signin'
    ? 'Sign in to save progress and continue training.'
    : 'Create an account to build activities, scenarios, and train.',
)
const submitLabel = computed(() => {
  if (loading.value) return 'Please wait…'
  return mode.value === 'signin' ? 'Sign in' : 'Create account'
})

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
      return
    }

    const result = await auth.signUp(email.value, password.value, nextPath.value)
    if (result.error) {
      error.value = result.error
      if (result.needsSignIn) {
        mode.value = 'signin'
      }
      return
    }

    if (auth.isSignedIn) {
      await router.push(nextPath.value)
      return
    }

    info.value = 'Account created. You can sign in now.'
    mode.value = 'signin'
  } finally {
    loading.value = false
  }
}

async function handleGoogle(): Promise<void> {
  loading.value = true
  error.value = null
  info.value = null
  const googleError = await auth.signInWithGoogle(nextPath.value)
  if (googleError) {
    error.value = googleError
    loading.value = false
  }
}

function setMode(next: Mode): void {
  mode.value = next
  error.value = null
  info.value = null
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
          <button
            type="button"
            class="auth-google"
            :disabled="loading"
            @click="handleGoogle"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <div class="auth-divider"><span>or email</span></div>

          <form class="auth-form" @submit.prevent="handleEmailAuth">
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
                minlength="6"
                :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
                placeholder="••••••••"
              />
            </label>

            <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
            <p v-if="info" class="auth-info" role="status">{{ info }}</p>

            <button type="submit" class="auth-submit" :disabled="loading">
              {{ submitLabel }}
            </button>
          </form>
        </div>

        <p class="auth-switch">
          <template v-if="mode === 'signin'">
            New here?
            <button type="button" @click="setMode('signup')">Create an account</button>
          </template>
          <template v-else>
            Already have an account?
            <button type="button" @click="setMode('signin')">Sign in</button>
          </template>
        </p>
      </div>
    </div>
  </div>
</template>
