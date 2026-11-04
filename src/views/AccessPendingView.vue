<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ACCESS_PENDING_MESSAGE } from '@/lib/auth/accessPending'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()

async function signOut(): Promise<void> {
  await auth.signOut()
}
</script>

<template>
  <div class="auth-screen">
    <div class="auth-grid" aria-hidden="true" />
    <div class="auth-content">
      <div class="auth-panel">
        <div class="auth-header">
          <RouterLink to="/" class="auth-logo">
            <img src="/AD_Logo.svg" alt="AlertDriving" />
          </RouterLink>
          <h1>Access pending</h1>
        </div>
        <p class="auth-info" role="status">{{ ACCESS_PENDING_MESSAGE }}</p>
        <button type="button" class="auth-submit" @click="signOut">Sign out</button>
      </div>
    </div>
  </div>
</template>
