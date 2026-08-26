<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ProcessInstructionCard from '@/components/process/ProcessInstructionCard.vue'

const props = withDefaults(
  defineProps<{
    src: string
    instructionText?: string
    instructionPill?: string
    /** Keep the last frame visible (e.g. while questions show over the clip). */
    holdEnd?: boolean
  }>(),
  {
    instructionText: '',
    instructionPill: 'See',
    holdEnd: false,
  },
)

const emit = defineEmits<{
  continue: []
}>()

const video = ref<HTMLVideoElement | null>(null)
const started = ref(false)
const finished = ref(false)

const trimmedInstruction = computed(() => props.instructionText.trim())
const showInstruction = computed(
  () => Boolean(trimmedInstruction.value) && !started.value && !props.holdEnd && !finished.value,
)

watch(
  () => props.src,
  () => {
    started.value = false
    finished.value = false
  },
)

watch(
  () => props.holdEnd,
  (hold) => {
    if (hold) holdLastFrame()
  },
)

function holdLastFrame(): void {
  const el = video.value
  if (!el) return
  el.pause()
  if (Number.isFinite(el.duration) && el.duration > 0) {
    try {
      el.currentTime = Math.max(0, el.duration - 0.05)
    } catch {
      /* last frame may still be painted */
    }
  }
}

function primeFirstFrame(): void {
  const el = video.value
  if (!el) return
  if (props.holdEnd || finished.value) {
    holdLastFrame()
    return
  }
  el.pause()
  try {
    if (el.currentTime < 0.001) {
      el.currentTime = 0.001
    }
  } catch {
    /* seek can fail before metadata is ready */
  }
  if (!trimmedInstruction.value) {
    started.value = true
    void el.play().catch(() => undefined)
  }
}

function begin(): void {
  started.value = true
  void video.value?.play().catch(() => undefined)
}

function onEnded(): void {
  if (finished.value) return
  finished.value = true
  holdLastFrame()
  emit('continue')
}

onBeforeUnmount(() => {
  video.value?.pause()
})
</script>

<template>
  <div class="see-missed-video" role="dialog" aria-label="Missed hazard video">
    <video
      ref="video"
      class="see-missed-video-player"
      :src="src"
      playsinline
      preload="auto"
      @loadedmetadata="primeFirstFrame"
      @ended="onEnded"
    />
    <div v-if="showInstruction" class="process-instruction-overlay">
      <ProcessInstructionCard
        :text="trimmedInstruction"
        :tag="instructionPill.trim() || 'See'"
        @begin="begin"
      />
    </div>
  </div>
</template>
