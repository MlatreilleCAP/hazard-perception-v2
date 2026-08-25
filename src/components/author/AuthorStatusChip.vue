<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <span class="author-chip">{{ label }}</span>
</template>
