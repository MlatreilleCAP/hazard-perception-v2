<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <div class="author-section-header">
    <h2>{{ title }}</h2>
    <slot name="action" />
  </div>
</template>
