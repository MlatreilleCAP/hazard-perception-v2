<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ProcessResultsLottie from '@/components/process/ProcessResultsLottie.vue'
import passAnimation from '@/assets/lottie/process-results.json'
import failAnimation from '@/assets/lottie/process-results-fail.json'
import {
  observeResultHeading,
  observeResultSubtext,
  type ObserveHazardOutcome,
  type ObserveResultCopy,
} from '@/types/see'

const props = defineProps<{
  outcome: ObserveHazardOutcome
  resultCopy: ObserveResultCopy
  explanation: string
  imageSrc?: string | null
}>()

defineEmits<{
  continue: []
}>()

const heading = computed(() => observeResultHeading(props.outcome, props.resultCopy))
const subtext = computed(() => observeResultSubtext(props.outcome, props.resultCopy))
const isSuccess = computed(() => props.outcome === 'success_first_attempt')
const showExplanation = computed(() => !isSuccess.value)
const explanationText = computed(() => props.explanation.trim())
const showImage = computed(() => !isSuccess.value && Boolean(props.imageSrc))
const imageReady = ref(false)
const photoStyle = computed(() => {
  if (!props.imageSrc) return undefined
  return { '--hazard-photo': `url(${JSON.stringify(props.imageSrc)})` }
})

watch(
  () => props.imageSrc,
  (src) => {
    imageReady.value = false
    if (!src) return
    let cancelled = false
    const preload = new Image()
    const markReady = () => {
      if (!cancelled) imageReady.value = true
    }
    preload.onload = () => {
      if (typeof preload.decode === 'function') {
        void preload.decode().then(markReady).catch(markReady)
        return
      }
      markReady()
    }
    preload.onerror = markReady
    preload.src = src
    if (preload.complete && preload.naturalWidth > 0) {
      if (typeof preload.decode === 'function') {
        void preload.decode().then(markReady).catch(markReady)
      } else {
        markReady()
      }
    }
    return () => {
      cancelled = true
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="process-results-page"
    role="main"
    :aria-label="
      isSuccess
        ? 'Observe results — section passed'
        : 'Observe results — coaching required'
    "
  >
    <div class="see-results-heading">
      <p class="process-results-announcement is-emphasis">{{ heading }}</p>
      <p v-if="subtext" class="see-results-attempts">{{ subtext }}</p>
    </div>
    <section
      class="process-results-score-card"
      :class="{ 'is-hazard-image': showImage }"
      aria-hidden="true"
    >
      <div class="process-results-lottie-fill">
        <div v-if="showImage" class="see-results-hazard-image-frame">
          <div
            class="see-results-hazard-token"
            :class="{ 'is-in': imageReady }"
            :style="photoStyle"
          >
            <div class="see-results-hazard-image-mask">
              <img :src="imageSrc ?? undefined" alt="" class="see-results-hazard-image" />
            </div>
          </div>
        </div>
        <ProcessResultsLottie v-else :animation-data="isSuccess ? passAnimation : failAnimation" />
      </div>
    </section>
    <div v-if="showExplanation && explanationText" class="see-results-explanations">
      <p class="see-results-explanation">{{ explanationText }}</p>
    </div>
    <button type="button" class="process-instruction-begin" @click="$emit('continue')">
      Continue
    </button>
  </div>
</template>
