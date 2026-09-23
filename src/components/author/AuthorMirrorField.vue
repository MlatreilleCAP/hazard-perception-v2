<script setup lang="ts">
defineProps<{
  label: string
  value: string
  multiline?: boolean
}>()
</script>

<template>
  <div class="mvp-mirror-field">
    <div class="author-field">
      <span style="min-width: 0; flex: 1">
        <span class="author-field-label">{{ label }}</span>
        <span class="author-field-control mvp-mirror-value" :class="{ 'is-multiline': multiline }">{{
          value
        }}</span>
      </span>
    </div>
  </div>
</template>
