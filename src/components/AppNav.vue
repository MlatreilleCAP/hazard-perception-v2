<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <nav class="app-nav" aria-label="Primary">
    <RouterLink to="/">Architecture</RouterLink>
    <RouterLink to="/studio">Studio</RouterLink>
    <RouterLink to="/player">Player</RouterLink>
  </nav>
</template>
