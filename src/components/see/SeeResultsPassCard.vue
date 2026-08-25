<script setup lang="ts">
import ProcessResultsLottie from '@/components/process/ProcessResultsLottie.vue'
import passAnimation from '@/assets/lottie/process-results.json'

defineProps<{
  explanations: string[]
}>()

defineEmits<{
  continue: []
}>()
</script>

<template>
  <div class="process-results-page" role="main" aria-label="See results — section passed">
    <p class="process-results-announcement is-emphasis">SECTION PASSED</p>
    <section class="process-results-score-card" aria-hidden="true">
      <div class="process-results-lottie-fill">
        <ProcessResultsLottie :animation-data="passAnimation" />
      </div>
    </section>
    <div v-if="explanations.length > 0" class="see-results-explanations">
      <p
        v-for="(text, index) in explanations"
        :key="index"
        class="see-results-explanation"
      >
        {{ text }}
      </p>
    </div>
    <button type="button" class="process-instruction-begin" @click="$emit('continue')">
      Continue
    </button>
  </div>
</template>
