<script setup lang="ts">
import { onMounted } from 'vue'
import AuthorSidebar from '@/components/author/AuthorSidebar.vue'
import { loadInroadsScoring } from '@/services/inroadsScoring'

import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()

onMounted(() => {
  if (!auth.isSales) void loadInroadsScoring()
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
