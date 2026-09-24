<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <div v-if="text" class="process-captions-overlay" aria-live="polite">
    <p class="process-captions-cue">{{ text }}</p>
  </div>
</template>
