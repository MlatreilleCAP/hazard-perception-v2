<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { safeNextPath } from '@/app/safeNextPath'
import { exchangeAuthCode } from '@/services/auth'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

onMounted(async () => {
  const next = safeNextPath(String(route.query.next ?? '')) ?? '/'
  const code = route.query.code

  if (typeof code === 'string' && code) {
    const error = await exchangeAuthCode(code)
    if (error) {
      await router.replace({
        path: '/login',
        query: { error: 'auth_callback_failed', next },
      })
      return
    }
  }

  await auth.initialize()
  if (auth.isSignedIn) {
    await router.replace(next)
    return
  }

  await router.replace({
    path: '/login',
    query: { error: 'auth_callback_failed', next },
  })
})
</script>

<template>
  <div class="auth-screen">
    <div class="auth-content">
      <p class="auth-callback">Signing you in…</p>
    </div>
  </div>
</template>
