<script setup lang="ts">
import AppNav from '@/components/AppNav.vue'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Independent v2 platform</p>
        <h1>Hazard Perception</h1>
        <p v-if="auth.email" class="auth-user">{{ auth.email }}</p>
      </div>
      <AppNav />
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
