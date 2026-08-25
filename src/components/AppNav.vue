<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()

async function signOut(): Promise<void> {
  await auth.signOut()
  await router.push('/login')
}
</script>

<template>
  <nav class="app-nav" aria-label="Primary">
    <RouterLink to="/">Architecture</RouterLink>
    <RouterLink to="/studio">Studio</RouterLink>
    <RouterLink to="/player">Player</RouterLink>
    <RouterLink v-if="!auth.isSignedIn" to="/login">Sign in</RouterLink>
    <button v-else type="button" class="app-nav-button" @click="signOut">
      Sign out
    </button>
  </nav>
</template>
