<script setup lang="ts">
import ProcessResultsLottie from '@/components/process/ProcessResultsLottie.vue'
import segmentLoadAnimation from '@/assets/lottie/lesson-segment-load.json'
</script>

<template>
  <div
    class="lesson-preloader"
    role="status"
    aria-live="polite"
    aria-busy="true"
    aria-label="Loading"
  >
    <div class="lesson-preloader-lottie" aria-hidden="true">
      <ProcessResultsLottie :animation-data="segmentLoadAnimation" loop />
    </div>
  </div>
</template>
