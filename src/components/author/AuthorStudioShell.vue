<script setup lang="ts">
import AuthorSidebar from '@/components/author/AuthorSidebar.vue'
</script>

<template>
  <div class="author-app">
    <AuthorSidebar />
    <main class="author-main">
      <RouterView />
    </main>
  </div>
</template>
