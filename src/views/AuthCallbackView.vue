<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { safeNextPath } from '@/app/safeNextPath'
import { establishPasswordRecovery, exchangeAuthCode } from '@/services/auth'
import { useAuthStore } from '@/stores/authStore'

const RESET_PATH = '/reset-password'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

onMounted(async () => {
  const next = safeNextPath(String(route.query.next ?? '')) ?? '/'
  if (next === RESET_PATH) {
    // Resolve the callback before leaving this URL. Navigating first drops the
    // code, and a signed-in session would then look like a successful recovery.
    await establishPasswordRecovery()
    await router.replace({ path: RESET_PATH })
    return
  }

  const code = route.query.code
  if (typeof code === 'string' && code) {
    const error = await exchangeAuthCode(code)
    if (error) {
      await router.replace(signInFailure(next))
      return
    }
  }

  await auth.initialize()
  if (auth.isSignedIn) {
    await router.replace(next)
    return
  }

  await router.replace(signInFailure(next))
})

function signInFailure(next: string) {
  return { path: '/login', query: { error: 'auth_callback_failed', next } }
}
</script>

<template>
  <div class="auth-screen">
    <div class="auth-content">
      <p class="auth-callback">Signing you in…</p>
    </div>
  </div>
</template>
