<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ProcessInstructionCard from '@/components/process/ProcessInstructionCard.vue'
import { DEFAULT_SEE_INSTRUCTION_PILL } from '@/types/see'

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
    instructionPill: DEFAULT_SEE_INSTRUCTION_PILL,
    holdEnd: false,
  },
)

const emit = defineEmits<{
  continue: []
  ready: []
}>()

const video = ref<HTMLVideoElement | null>(null)
const started = ref(false)
const finished = ref(false)
const frameReady = ref(false)
let primeToken = 0
let priming = false

const trimmedInstruction = computed(() => props.instructionText.trim())
const showInstruction = computed(
  () =>
    frameReady.value &&
    Boolean(trimmedInstruction.value) &&
    !started.value &&
    !props.holdEnd &&
    !finished.value,
)

watch(
  () => props.src,
  () => {
    primeToken += 1
    priming = false
    started.value = false
    finished.value = false
    frameReady.value = false
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
  if (!Number.isFinite(el.duration) || el.duration <= 0.15) return
  const holdTime = Math.max(0, el.duration - 0.04)
  try {
    if (el.currentTime < holdTime) {
      el.currentTime = holdTime
    }
  } catch {
    /* last frame may still be painted */
  }
}

function waitForEvent(el: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  if (event === 'loadeddata' && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve()
  }
  if (event === 'seeked' && !el.seeking) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      el.removeEventListener(event, done)
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(done, timeoutMs)
    el.addEventListener(event, done)
  })
}

function waitForAnimationPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

async function waitForPresentedFrame(el: HTMLVideoElement): Promise<void> {
  const requestFrame = el.requestVideoFrameCallback?.bind(el)
  if (!requestFrame) {
    await waitForAnimationPaint()
    return
  }
  await new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(done, 800)
    try {
      requestFrame(() => done())
    } catch {
      done()
    }
  })
  await waitForAnimationPaint()
}

async function primeFirstFrame(): Promise<void> {
  if (priming || frameReady.value) return
  priming = true
  const token = ++primeToken
  const el = video.value
  if (!el) {
    priming = false
    return
  }

  el.playsInline = true
  el.setAttribute('playsinline', '')
  el.setAttribute('webkit-playsinline', '')

  if (props.holdEnd || finished.value) {
    holdLastFrame()
    if (token !== primeToken) {
      priming = false
      return
    }
    frameReady.value = true
    priming = false
    emit('ready')
    return
  }

  if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForEvent(el, 'loadeddata', 5000)
  }
  if (token !== primeToken) {
    priming = false
    return
  }

  el.pause()
  try {
    if (el.currentTime < 0.001) el.currentTime = 0.001
  } catch {
    /* seek can fail before metadata is ready */
  }
  if (el.seeking) {
    await waitForEvent(el, 'seeked', 1000)
  }
  if (token !== primeToken) {
    priming = false
    return
  }

  // Muted warm-up paints a real frame before we reveal the stage (avoids black flash).
  const wasMuted = el.muted
  try {
    el.muted = true
    await el.play()
    await waitForPresentedFrame(el)
    el.pause()
  } catch {
    await waitForPresentedFrame(el)
  } finally {
    el.muted = wasMuted
  }
  if (token !== primeToken) {
    priming = false
    return
  }

  try {
    el.currentTime = 0
  } catch {
    /* ignore */
  }
  if (el.seeking) {
    await waitForEvent(el, 'seeked', 1000)
  }
  await waitForAnimationPaint()
  if (token !== primeToken) {
    priming = false
    return
  }

  frameReady.value = true
  priming = false
  emit('ready')

  if (!trimmedInstruction.value) {
    started.value = true
    void el.play().catch(() => undefined)
  }
}

function begin(): void {
  if (!frameReady.value) return
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
  primeToken += 1
  video.value?.pause()
})
</script>

<template>
  <div
    class="see-missed-video"
    :class="{ 'is-warming': !frameReady }"
    role="dialog"
    aria-label="Missed hazard video"
    :aria-busy="!frameReady"
  >
    <video
      ref="video"
      class="see-missed-video-player"
      :class="{ 'is-visible': frameReady }"
      :src="src"
      playsinline
      preload="auto"
      @loadedmetadata="primeFirstFrame"
      @loadeddata="primeFirstFrame"
      @ended="onEnded"
    />
    <div v-if="showInstruction" class="process-instruction-overlay">
      <ProcessInstructionCard
        :text="trimmedInstruction"
        :tag="instructionPill.trim() || DEFAULT_SEE_INSTRUCTION_PILL"
        @begin="begin"
      />
    </div>
  </div>
</template>
