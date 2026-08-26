<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ProcessInstructionCard from '@/components/process/ProcessInstructionCard.vue'

const props = defineProps<{
  src: string
  instructionText: string
  instructionPill?: string
  compact?: boolean
  holdEnd?: boolean
}>()

const emit = defineEmits<{
  ended: []
  begin: []
}>()

const active = ref(0)
const srcA = ref(props.src)
const srcB = ref('')
const videoA = ref<HTMLVideoElement | null>(null)
const videoB = ref<HTMLVideoElement | null>(null)
const pendingSlot = ref<number | null>(null)
const started = ref(false)
const finished = ref(false)
let activateToken = 0

const showInstruction = computed(
  () => Boolean(props.instructionText.trim()) && !started.value && !props.holdEnd,
)
const showControls = computed(
  () => Boolean(props.compact) && !showInstruction.value && !props.holdEnd,
)

function videoAt(slot: number): HTMLVideoElement | null {
  return slot === 0 ? videoA.value : videoB.value
}

function activeVideo(): HTMLVideoElement | null {
  return videoAt(active.value)
}

function fitCompact(el: HTMLVideoElement): void {
  if (!props.compact || el.videoWidth <= 0 || el.videoHeight <= 0) return
  el.style.setProperty('--author-video-aspect', `${el.videoWidth} / ${el.videoHeight}`)
  const parentWidth = el.parentElement?.parentElement?.clientWidth || el.videoWidth
  const maxHeightPx = Number.parseFloat(getComputedStyle(el).maxHeight) || 384
  let height = Math.min(maxHeightPx, el.videoHeight)
  let width = (el.videoWidth / el.videoHeight) * height
  if (width > parentWidth) {
    width = parentWidth
    height = width / (el.videoWidth / el.videoHeight)
  }
  el.style.width = `${Math.round(width)}px`
  el.style.height = `${Math.round(height)}px`
}

function holdLastFrame(): void {
  const el = activeVideo()
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

function waitForEvent(el: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
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

async function waitForFirstFrame(el: HTMLVideoElement): Promise<void> {
  if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForEvent(el, 'loadeddata', 5000)
  }

  try {
    if (el.currentTime < 0.001) el.currentTime = 0.001
  } catch {
    // Seek can fail before metadata is ready.
  }

  const requestFrame = el.requestVideoFrameCallback?.bind(el)
  if (requestFrame) {
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => resolve(), 5000)
      requestFrame(() => {
        window.clearTimeout(timer)
        resolve()
      })
    })
    await waitForAnimationPaint()
    return
  }

  await waitForEvent(el, 'seeked', 2000)
  if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    try {
      await el.play()
      el.pause()
    } catch {
      // Autoplay may be blocked; fall through with whatever frame is available.
    }
  }
  await waitForAnimationPaint()
}

async function activateSlot(slot: number): Promise<void> {
  const token = ++activateToken
  const el = videoAt(slot)
  if (!el) return
  fitCompact(el)
  el.pause()
  await waitForFirstFrame(el)
  if (token !== activateToken) return

  const previous = active.value
  // Keep the previous clip painted until this slot is ready, then swap.
  active.value = slot
  pendingSlot.value = null
  started.value = false
  finished.value = false
  if (previous !== slot) {
    videoAt(previous)?.pause()
  }

  const shouldPlay = !props.instructionText.trim() && !props.holdEnd
  if (shouldPlay) {
    started.value = true
    void el.play().catch(() => undefined)
  }
}

function onLoadedMetadata(slot: number): void {
  if (pendingSlot.value === slot) {
    void activateSlot(slot)
    return
  }
  if (slot === active.value) {
    void activateSlot(slot)
  }
}

watch(
  () => props.src,
  (next, prev) => {
    if (!next || next === prev) return
    if (!prev) {
      srcA.value = next
      active.value = 0
      pendingSlot.value = 0
      return
    }
    const nextSlot = active.value === 0 ? 1 : 0
    pendingSlot.value = nextSlot
    if (nextSlot === 0) srcA.value = next
    else srcB.value = next
  },
)

watch(
  () => props.holdEnd,
  (holding, wasHolding) => {
    if (holding) {
      holdLastFrame()
      return
    }
    if (!wasHolding || props.instructionText.trim() || started.value || finished.value) return
    const el = activeVideo()
    if (!el) return
    started.value = true
    void el.play().catch(() => undefined)
  },
)

function begin(): void {
  started.value = true
  emit('begin')
  const el = activeVideo()
  if (!el) return
  void el.play().catch(() => undefined)
}

function finishPlayback(slot: number): void {
  if (slot !== active.value) return
  if (!started.value || finished.value || props.compact || props.holdEnd) return
  const el = activeVideo()
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

function onTimeUpdate(slot: number): void {
  if (slot !== active.value) return
  if (props.compact || props.holdEnd || !started.value || finished.value) return
  const el = activeVideo()
  if (!el || !Number.isFinite(el.duration) || el.duration < 0.5) return
  if (el.currentTime >= el.duration - 0.12) {
    finishPlayback(slot)
  }
}

defineExpose({ holdLastFrame })

onBeforeUnmount(() => {
  activateToken += 1
  videoA.value?.pause()
  videoB.value?.pause()
})
</script>

<template>
  <div class="process-video-stage" :class="compact ? 'is-compact' : 'is-fill'">
    <div class="process-video-frame">
      <video
        ref="videoA"
        class="process-video"
        :class="{ 'is-active': active === 0 }"
        :src="srcA || undefined"
        playsinline
        preload="auto"
        :controls="showControls && active === 0"
        @loadedmetadata="onLoadedMetadata(0)"
        @timeupdate="onTimeUpdate(0)"
        @ended="finishPlayback(0)"
      />
      <video
        ref="videoB"
        class="process-video"
        :class="{ 'is-active': active === 1 }"
        :src="srcB || undefined"
        playsinline
        preload="auto"
        :controls="showControls && active === 1"
        @loadedmetadata="onLoadedMetadata(1)"
        @timeupdate="onTimeUpdate(1)"
        @ended="finishPlayback(1)"
      />
    </div>
    <div v-if="showInstruction" class="process-instruction-overlay">
      <ProcessInstructionCard
        :text="instructionText.trim()"
        :tag="instructionPill?.trim() || undefined"
        @begin="begin"
      />
    </div>
  </div>
</template>
