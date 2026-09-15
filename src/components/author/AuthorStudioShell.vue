<script setup lang="ts">
import { onMounted } from 'vue'
import AuthorSidebar from '@/components/author/AuthorSidebar.vue'
import { loadInroadsScoring } from '@/services/inroadsScoring'

onMounted(() => {
  void loadInroadsScoring()
})
</script>

<template>
  <div class="author-app">
    <AuthorSidebar />
    <main class="author-main">
      <RouterView />
    </main>
  </div>
</template>
