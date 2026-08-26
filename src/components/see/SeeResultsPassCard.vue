<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ProcessResultsLottie from '@/components/process/ProcessResultsLottie.vue'
import passAnimation from '@/assets/lottie/process-results.json'
import failAnimation from '@/assets/lottie/process-results-fail.json'

const props = withDefaults(
  defineProps<{
    variant?: 'passed' | 'coaching' | 'missed'
    attempts?: number
    imageSrc?: string | null
    explanations: string[]
  }>(),
  { variant: 'passed', attempts: 1, imageSrc: null },
)

defineEmits<{
  continue: []
}>()

const heading = computed(() =>
  props.variant === 'passed' ? 'SECTION PASSED' : 'COACHING REQUIRED',
)

const attemptsLabel = computed(() => {
  if (props.variant === 'missed') return 'You did not spot the hazard'
  const count = Math.max(1, props.attempts)
  const word = count === 1 ? 'attempt' : 'attempts'
  if (props.variant === 'coaching') {
    return `It took you ${count} ${word} to spot the hazard`
  }
  return `You found the hazard in ${count} ${word}`
})

const showMissedImage = computed(
  () => props.variant === 'missed' && Boolean(props.imageSrc),
)
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
      variant === 'passed'
        ? 'See results — section passed'
        : variant === 'missed'
          ? 'See results — hazard missed'
          : 'See results — coaching required'
    "
  >
    <div class="see-results-heading">
      <p class="process-results-announcement is-emphasis">{{ heading }}</p>
      <p class="see-results-attempts">{{ attemptsLabel }}</p>
    </div>
    <section
      class="process-results-score-card"
      :class="{ 'is-hazard-image': showMissedImage }"
      aria-hidden="true"
    >
      <div class="process-results-lottie-fill">
        <div v-if="showMissedImage" class="see-results-hazard-image-frame">
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
        <ProcessResultsLottie
          v-else
          :animation-data="variant === 'passed' ? passAnimation : failAnimation"
        />
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
