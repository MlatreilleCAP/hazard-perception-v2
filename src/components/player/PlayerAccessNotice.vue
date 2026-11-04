<script setup lang="ts">
defineProps<{
  message: string | null
}>()
</script>

<template>
  <p v-if="message" class="player-access-notice" role="status">{{ message }}</p>
</template>
