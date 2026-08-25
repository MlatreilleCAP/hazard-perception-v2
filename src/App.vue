<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/app/AppShell.vue'

const route = useRoute()
const isAuthLayout = computed(() => route.meta.layout === 'auth')
</script>

<template>
  <RouterView v-if="isAuthLayout" />
  <AppShell v-else />
</template>
