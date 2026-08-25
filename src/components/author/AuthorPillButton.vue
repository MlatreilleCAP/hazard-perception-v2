<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'ghost' | 'white'
  disabled?: boolean
  type?: 'button' | 'submit'
}>()
</script>

<template>
  <button
    :type="type ?? 'button'"
    class="author-pill"
    :class="{
      'author-pill-primary': (variant ?? 'ghost') === 'primary',
      'author-pill-ghost': (variant ?? 'ghost') === 'ghost',
      'author-pill-white': variant === 'white',
    }"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>
