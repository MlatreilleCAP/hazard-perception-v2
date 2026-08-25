<script setup lang="ts">
import ProcessResultsLottie from '@/components/process/ProcessResultsLottie.vue'
import ProcessResultsQuestionList from '@/components/process/ProcessResultsQuestionList.vue'
import type { ProcessQuestionResult } from '@/types/questions'
import failAnimation from '@/assets/lottie/process-results-fail.json'

defineProps<{
  results: ProcessQuestionResult[]
}>()

defineEmits<{
  continue: []
}>()
</script>

<template>
  <div class="process-results-page" role="main" aria-label="Process results — additional coaching">
    <p class="process-results-announcement">Additional Coaching Required</p>
    <section class="process-results-score-card" aria-hidden="true">
      <div class="process-results-lottie-fill">
        <ProcessResultsLottie :animation-data="failAnimation" />
      </div>
    </section>

    <ProcessResultsQuestionList :results="results" />

    <button type="button" class="process-instruction-begin" @click="$emit('continue')">
      Continue
    </button>
  </div>
</template>
