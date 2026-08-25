<script setup lang="ts">
defineProps<{
  text: string
  tag?: string
  actionLabel?: string
}>()

defineEmits<{
  begin: []
}>()
</script>

<template>
  <div class="process-instruction-card" role="dialog" aria-label="Process instruction">
    <div class="process-instruction-card-body">
      <div class="process-instruction-tag">{{ tag ?? 'Process' }}</div>
      <p class="process-instruction-text">{{ text }}</p>
      <button type="button" class="process-instruction-begin" @click="$emit('begin')">
        {{ actionLabel ?? 'Begin' }}
      </button>
    </div>
  </div>
</template>
