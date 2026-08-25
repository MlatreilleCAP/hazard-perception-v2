<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  variant: 'success' | 'missed'
  attempts?: number
}>()

const emit = defineEmits<{
  continue: []
}>()

const message = computed(() => {
  if (props.variant === 'success') {
    if (props.attempts == null) return 'You found it'
    return `You found it in ${props.attempts} ${props.attempts === 1 ? 'attempt' : 'attempts'}`
  }
  return 'No hazard selected'
})

const iconSrc = computed(
  () =>
    `${import.meta.env.BASE_URL}${
      props.variant === 'success' ? '045-party-1.svg' : '023-crying-1.svg'
    }`,
)
</script>

<template>
  <div
    class="see-feedback-card learner-card-pop"
    role="dialog"
    :aria-label="message"
  >
    <img :src="iconSrc" alt="" width="70" height="70" aria-hidden="true" />
    <p>{{ message }}</p>
    <button type="button" class="process-instruction-begin" @click="emit('continue')">
      Continue
    </button>
  </div>
</template>
