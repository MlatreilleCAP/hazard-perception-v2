<script setup lang="ts">
import AppNav from '@/components/AppNav.vue'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Independent v2 platform</p>
        <h1>Hazard Perception</h1>
      </div>
      <AppNav />
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
