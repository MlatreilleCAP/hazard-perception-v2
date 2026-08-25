<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/app/AppShell.vue'

const route = useRoute()
const isChromeLess = computed(
  () =>
    route.meta.layout === 'auth' ||
    route.meta.layout === 'landing' ||
    route.meta.layout === 'author',
)
</script>

<template>
  <RouterView v-if="isChromeLess" />
  <AppShell v-else />
</template>
