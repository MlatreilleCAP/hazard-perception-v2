<script setup lang="ts">
import { computed } from 'vue'
import circleLoadAnimation from '@/assets/lottie/lesson-segment-load-circle.json'
import segmentLoadAnimation from '@/assets/lottie/lesson-segment-load.json'
import ProcessResultsLottie from '@/components/process/ProcessResultsLottie.vue'
import { isEnglishLessonLanguage, useLessonLanguage } from '@/lib/lesson/buttonLabel'

const language = useLessonLanguage()
const animation = computed(() =>
  isEnglishLessonLanguage(language.value) ? segmentLoadAnimation : circleLoadAnimation,
)
const isCircle = computed(() => !isEnglishLessonLanguage(language.value))
</script>

<template>
  <div
    class="lesson-preloader"
    role="status"
    aria-live="polite"
    aria-busy="true"
    aria-label="Loading"
  >
    <div class="lesson-preloader-lottie" :class="{ 'is-circle': isCircle }" aria-hidden="true">
      <ProcessResultsLottie :animation-data="animation" loop />
    </div>
  </div>
</template>
