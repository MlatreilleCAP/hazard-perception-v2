<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CaptionsOverlay from '@/components/process/CaptionsOverlay.vue'
import ProcessInstructionCard from '@/components/process/ProcessInstructionCard.vue'
import { services } from '@/app/container'
import {
  activeCaptionText,
  loadCaptionsFromUrl,
  parseCaptionsText,
  type CaptionCue,
} from '@/lib/media/captions'

const props = defineProps<{
  src: string
  instructionText: string
  instructionPill?: string
  compact?: boolean
  holdEnd?: boolean
  /** Media asset id for a .vtt captions file (preferred). */
  captionsMediaId?: string
  /** Fallback public/signed VTT URL when no media id is available. */
  captionsSrc?: string
}>()

const emit = defineEmits<{
  ended: []
  begin: []
  ready: []
}>()

const active = ref(0)
const srcA = ref(props.src)
const srcB = ref('')
const videoA = ref<HTMLVideoElement | null>(null)
const videoB = ref<HTMLVideoElement | null>(null)
const pendingSlot = ref<number | null>(null)
const started = ref(false)
const finished = ref(false)
const showAutoplayPrompt = ref(false)
const captionsOn = ref(true)
const captionCues = ref<CaptionCue[]>([])
const captionText = ref('')
let captionLoadToken = 0
let activateToken = 0

const showInstruction = computed(
  () => Boolean(props.instructionText.trim()) && !started.value && !props.holdEnd,
)
const showControls = computed(
  () => Boolean(props.compact) && !showInstruction.value && !props.holdEnd,
)
const showCaptionsToggle = computed(
  () => Boolean(props.captionsMediaId?.trim() || props.captionsSrc?.trim()),
)
const showCaptionCue = computed(
  () => captionsOn.value && Boolean(captionText.value.trim()),
)

function videoAt(slot: number): HTMLVideoElement | null {
  return slot === 0 ? videoA.value : videoB.value
}

function activeVideo(): HTMLVideoElement | null {
  return videoAt(active.value)
}

function updateCaptionText(timeSeconds: number): void {
  if (!captionsOn.value || captionCues.value.length === 0) {
    captionText.value = ''
    return
  }
  captionText.value = activeCaptionText(captionCues.value, timeSeconds)
}

function toggleCaptions(): void {
  captionsOn.value = !captionsOn.value
  const el = activeVideo()
  updateCaptionText(el?.currentTime ?? 0)
}

async function loadCaptions(): Promise<void> {
  const token = ++captionLoadToken
  captionCues.value = []
  captionText.value = ''
  const mediaId = props.captionsMediaId?.trim()
  const url = props.captionsSrc?.trim()
  if (!mediaId && !url) return
  try {
    const cues = mediaId
      ? parseCaptionsText(await services.media.getTextContent(mediaId))
      : await loadCaptionsFromUrl(url!)
    if (token !== captionLoadToken) return
    captionCues.value = cues
    updateCaptionText(activeVideo()?.currentTime ?? 0)
  } catch {
    if (token !== captionLoadToken) return
    captionCues.value = []
    captionText.value = ''
  }
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
  const holdTime = Math.max(0, duration - 0.04)
  try {
    // Only seek forward — seeking backward causes a visible frame jump when questions appear.
    if (el.currentTime < holdTime) {
      el.currentTime = holdTime
    }
  } catch {
    // Ignore seek errors after native ended.
  }
}

function configureInlinePlayback(el: HTMLVideoElement): void {
  el.playsInline = true
  el.setAttribute('playsinline', '')
  el.setAttribute('webkit-playsinline', '')
}

async function startPlayback(el: HTMLVideoElement): Promise<boolean> {
  configureInlinePlayback(el)
  try {
    await el.play()
    return true
  } catch {
    // iOS and most mobile browsers block unmuted autoplay without a fresh gesture.
  }
  try {
    el.muted = true
    await el.play()
    return true
  } catch {
    return false
  }
}

function waitForEvent(el: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  if (event === 'loadeddata' && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve()
  }
  if (event === 'seeked' && !el.seeking) {
    return Promise.resolve()
  }
  if (event === 'playing' && !el.paused) {
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

async function waitForFirstFrame(
  el: HTMLVideoElement,
  options?: { autoplay?: boolean },
): Promise<void> {
  if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForEvent(el, 'loadeddata', 5000)
  }

  // Autoplay clips (e.g. lesson intro) should start as soon as data is ready.
  // Waiting on requestVideoFrameCallback while paused can stall for the full timeout.
  if (options?.autoplay) {
    try {
      if (el.currentTime < 0.001) el.currentTime = 0.001
    } catch {
      // Seek can fail before metadata is ready.
    }
    if (el.seeking) {
      await waitForEvent(el, 'seeked', 1000)
    }
    await waitForAnimationPaint()
    return
  }

  try {
    if (el.currentTime < 0.001) el.currentTime = 0.001
  } catch {
    // Seek can fail before metadata is ready.
  }

  if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    await waitForAnimationPaint()
    return
  }

  const requestFrame = el.requestVideoFrameCallback?.bind(el)
  if (requestFrame) {
    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        el.removeEventListener('seeked', done)
        resolve()
      }
      const timer = window.setTimeout(done, 500)
      el.addEventListener('seeked', done)
      try {
        requestFrame(() => done())
      } catch {
        done()
      }
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
  configureInlinePlayback(el)
  fitCompact(el)
  el.pause()
  const shouldPlay = !props.instructionText.trim() && !props.holdEnd
  await waitForFirstFrame(el, { autoplay: shouldPlay })
  if (token !== activateToken) return

  const previous = active.value
  // Keep the previous clip painted until this slot is ready, then swap.
  active.value = slot
  pendingSlot.value = null
  started.value = false
  finished.value = false
  showAutoplayPrompt.value = false
  if (previous !== slot) {
    videoAt(previous)?.pause()
  }

  if (shouldPlay) {
    const playing = await startPlayback(el)
    started.value = playing
    if (!playing) {
      showAutoplayPrompt.value = true
    }
  }

  updateCaptionText(el.currentTime)
  emit('ready')
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
  { immediate: true },
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
    void startPlayback(el).then((playing) => {
      if (playing) started.value = true
    })
  },
)

watch(
  () => [props.captionsMediaId, props.captionsSrc] as const,
  () => {
    void loadCaptions()
  },
  { immediate: true },
)

function begin(): void {
  showAutoplayPrompt.value = false
  started.value = true
  emit('begin')
  const el = activeVideo()
  if (!el) return
  void startPlayback(el)
}

function finishPlayback(slot: number): void {
  if (slot !== active.value) return
  if (!started.value || finished.value || props.compact || props.holdEnd) return
  const el = activeVideo()
  const duration = el?.duration ?? 0
  const currentTime = el?.currentTime ?? 0
  if (!Number.isFinite(duration) || duration <= 0) return
  // Some browsers reset currentTime to 0 on the native `ended` event — treat
  // el.ended / near-end as a real finish so lesson intro can advance.
  const nearEnd =
    el?.ended === true ||
    (Number.isFinite(currentTime) && currentTime >= Math.max(0, duration - 0.25))
  if (duration >= 2 && !nearEnd && currentTime < Math.min(1, duration * 0.5)) {
    return
  }
  finished.value = true
  holdLastFrame()
  emit('ended')
}

function onTimeUpdate(slot: number): void {
  if (slot !== active.value) return
  const el = activeVideo()
  if (el) updateCaptionText(el.currentTime)
  if (props.compact || props.holdEnd || !started.value || finished.value) return
  if (!el || !Number.isFinite(el.duration) || el.duration < 0.5) return
  if (el.currentTime >= el.duration - 0.12) {
    finishPlayback(slot)
  }
}

defineExpose({ holdLastFrame })

onBeforeUnmount(() => {
  activateToken += 1
  captionLoadToken += 1
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
    <CaptionsOverlay :text="showCaptionCue ? captionText : ''" />
    <div v-if="showInstruction || showAutoplayPrompt" class="process-instruction-overlay">
      <ProcessInstructionCard
        v-if="showInstruction"
        :text="instructionText.trim()"
        :tag="instructionPill?.trim() || undefined"
        @begin="begin"
      />
      <button
        v-else
        type="button"
        class="process-autoplay-prompt"
        @click="begin"
      >
        Tap to play
      </button>
    </div>
    <button
      v-if="showCaptionsToggle"
      type="button"
      class="process-captions-toggle"
      :class="{ 'is-on': captionsOn }"
      :aria-pressed="captionsOn"
      :aria-label="captionsOn ? 'Turn captions off' : 'Turn captions on'"
      @click="toggleCaptions"
    >
      CC
    </button>
  </div>
</template>
