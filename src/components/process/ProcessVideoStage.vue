<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ProcessInstructionCard from '@/components/process/ProcessInstructionCard.vue'

const props = defineProps<{
  src: string
  instructionText: string
  compact?: boolean
  holdEnd?: boolean
}>()

const emit = defineEmits<{
  ended: []
}>()

const video = ref<HTMLVideoElement | null>(null)
const started = ref(false)
const finished = ref(false)

const showInstruction = computed(
  () => Boolean(props.instructionText.trim()) && !started.value && !props.holdEnd,
)
const showControls = computed(
  () => Boolean(props.compact) && !showInstruction.value && !props.holdEnd,
)

watch(
  () => props.src,
  () => {
    started.value = false
    finished.value = false
  },
)

function primeFirstFrame(): void {
  const el = video.value
  if (!el) return
  el.pause()
  try {
    if (el.currentTime < 0.001) {
      el.currentTime = 0.001
    }
  } catch {
    // Seek can fail before metadata is ready.
  }
  if (!props.instructionText.trim()) {
    started.value = true
    void el.play().catch(() => undefined)
  }
}

function holdLastFrame(): void {
  const el = video.value
  if (!el) return
  el.pause()
  const duration = el.duration
  if (!Number.isFinite(duration) || duration <= 0.15) return
  try {
    el.currentTime = Math.max(0, duration - 0.08)
  } catch {
    // Ignore seek errors after native ended.
  }
}

function begin(): void {
  started.value = true
  const el = video.value
  if (!el) return
  void el.play().catch(() => undefined)
}

function finishPlayback(): void {
  if (!started.value || finished.value || props.compact) return
  const el = video.value
  const duration = el?.duration ?? 0
  const currentTime = el?.currentTime ?? 0
  if (!Number.isFinite(duration) || duration <= 0) return
  if (duration >= 2 && currentTime < Math.min(1, duration * 0.5)) {
    return
  }
  finished.value = true
  holdLastFrame()
  emit('ended')
}

function onTimeUpdate(): void {
  if (props.compact || !started.value || finished.value) return
  const el = video.value
  if (!el || !Number.isFinite(el.duration) || el.duration < 0.5) return
  if (el.currentTime >= el.duration - 0.12) {
    finishPlayback()
  }
}

defineExpose({ holdLastFrame })

onBeforeUnmount(() => {
  video.value?.pause()
})
</script>

<template>
  <div class="process-video-stage" :class="compact ? 'is-compact' : 'is-fill'">
    <video
      ref="video"
      class="process-video"
      :src="src"
      playsinline
      preload="auto"
      :controls="showControls"
      @loadedmetadata="primeFirstFrame"
      @timeupdate="onTimeUpdate"
      @ended="finishPlayback"
    />
    <div v-if="showInstruction" class="process-instruction-overlay">
      <ProcessInstructionCard :text="instructionText.trim()" @begin="begin" />
    </div>
  </div>
</template>
