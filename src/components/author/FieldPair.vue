<script setup lang="ts">
import AuthorMirrorField from '@/components/author/AuthorMirrorField.vue'

defineProps<{
  label: string
  value?: string | null
  enabled?: boolean
  multiline?: boolean
}>()
</script>

<template>
  <div class="mvp-field-pair" :class="{ 'is-single': !enabled }">
    <slot />
    <AuthorMirrorField
      v-if="enabled"
      class="is-english"
      :label="label"
      :value="value ?? ''"
      :multiline="multiline"
    />
  </div>
</template>
