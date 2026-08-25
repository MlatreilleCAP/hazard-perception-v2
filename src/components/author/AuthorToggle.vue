<script setup lang="ts">
defineProps<{
  id: string
  label: string
  description?: string
}>()

const checked = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    :id="id"
    type="button"
    class="author-toggle"
    role="switch"
    :aria-checked="checked"
    @click="checked = !checked"
  >
    <span>
      <span class="author-field-label">{{ label }}</span>
      <span v-if="description" class="author-muted" style="display: block; margin-top: 2px; font-size: 10px">
        {{ description }}
      </span>
    </span>
    <span class="author-switch" :class="{ on: checked }" aria-hidden="true">
      <span class="author-switch-knob" />
    </span>
  </button>
</template>
