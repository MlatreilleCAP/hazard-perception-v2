import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import {
  landscapeVideoDisplaySize,
  SEE_INITIAL_PAN_OFFSET_X,
  VIDEO_PAN_SLOP_PX,
} from '@/lib/hazards/coordinates'

const PAN_SAMPLE_WINDOW_MS = 80
const PAN_FLING_STALE_MS = 40
const PAN_SWIPE_MAX_MS = 320
const PAN_FLING_MIN_VELOCITY = 0.45
const PAN_FLING_VELOCITY_SCALE = 0.99
const PAN_INERTIA_STOP_VELOCITY = 0.02
const PAN_INERTIA_DECEL_MS = 320

export function useHorizontalVideoPan(options: {
  enabled: Ref<boolean>
  stage: Ref<HTMLElement | null>
  aspect: Ref<number | null>
}) {
  const panX = ref(0)
  const viewportSize = ref({ width: 0, height: 0 })
  let didCenterPan = false
  let resizeObserver: ResizeObserver | null = null
  let pointerStart: { x: number; y: number; pan: number; pointerId: number; scaleX: number } | null =
    null
  let pointerPanned = false
  let panInertiaFrame = 0
  let panVelocity = 0
  let panInertiaStamp = 0
  let panStartedAt = 0
  let panSamples: { t: number; pan: number }[] = []

  const planeSize = computed(() => {
    const aspect = options.aspect.value
    if (aspect == null) {
      return {
        width: Math.max(0, viewportSize.value.width),
        height: Math.max(0, viewportSize.value.height),
      }
    }
    return landscapeVideoDisplaySize(
      viewportSize.value.width,
      viewportSize.value.height,
      aspect,
    )
  })
  const planeReady = computed(
    () =>
      options.aspect.value != null &&
      viewportSize.value.width > 0 &&
      viewportSize.value.height > 0,
  )
  const maxPan = computed(() => Math.max(0, planeSize.value.width - viewportSize.value.width))
  const planeStyle = computed(() => ({
    width: `${planeSize.value.width}px`,
    height: `${planeSize.value.height}px`,
    transform: `translate3d(${-panX.value}px, 0, 0)`,
  }))

  function clampPan(value: number): number {
    return Math.min(maxPan.value, Math.max(0, value))
  }

  function stopPanInertia(): void {
    if (panInertiaFrame) {
      cancelAnimationFrame(panInertiaFrame)
      panInertiaFrame = 0
    }
    panVelocity = 0
  }

  function recordPanSample(pan: number): void {
    const t = performance.now()
    panSamples.push({ t, pan })
    const cutoff = t - PAN_SAMPLE_WINDOW_MS
    while (panSamples.length > 2 && panSamples[0]!.t < cutoff) {
      panSamples.shift()
    }
  }

  function panVelocityFromSamples(): number {
    const now = performance.now()
    const recent = panSamples.filter((sample) => now - sample.t <= PAN_SAMPLE_WINDOW_MS)
    if (recent.length < 2) return 0
    const first = recent[0]!
    const last = recent[recent.length - 1]!
    if (now - last.t > PAN_FLING_STALE_MS) return 0
    const dt = last.t - first.t
    if (dt < 8) return 0
    return (last.pan - first.pan) / dt
  }

  function tickPanInertia(now: number): void {
    const dt = Math.min(32, Math.max(0, now - panInertiaStamp))
    panInertiaStamp = now
    const unclamped = panX.value + panVelocity * dt
    const next = clampPan(unclamped)
    panX.value = next
    if (next !== unclamped) {
      stopPanInertia()
      return
    }
    panVelocity *= Math.exp(-dt / PAN_INERTIA_DECEL_MS)
    if (Math.abs(panVelocity) < PAN_INERTIA_STOP_VELOCITY) {
      stopPanInertia()
      return
    }
    panInertiaFrame = requestAnimationFrame(tickPanInertia)
  }

  function startPanInertia(velocity: number): void {
    stopPanInertia()
    if (
      Math.abs(velocity) < PAN_FLING_MIN_VELOCITY ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    panVelocity = velocity
    panInertiaStamp = performance.now()
    panInertiaFrame = requestAnimationFrame(tickPanInertia)
  }

  function centerPan(): void {
    panX.value = clampPan(maxPan.value / 2 - SEE_INITIAL_PAN_OFFSET_X)
  }

  function measureStage(): void {
    const el = options.stage.value
    if (!el) return
    viewportSize.value = { width: el.clientWidth, height: el.clientHeight }
    if (!didCenterPan && maxPan.value > 0) {
      centerPan()
      didCenterPan = true
      return
    }
    panX.value = clampPan(panX.value)
  }

  function resetPan(): void {
    stopPanInertia()
    didCenterPan = false
    panX.value = 0
    pointerStart = null
    pointerPanned = false
    panSamples = []
  }

  function onPointerDown(event: PointerEvent): void {
    if (!options.enabled.value || event.button !== 0) return
    stopPanInertia()
    pointerPanned = false
    panStartedAt = 0
    panSamples = []
    recordPanSample(panX.value)
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const layoutWidth = Math.max(1, target.offsetWidth)
    pointerStart = {
      x: event.clientX,
      y: event.clientY,
      pan: panX.value,
      pointerId: event.pointerId,
      scaleX: rect.width / layoutWidth,
    }
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      /* synthetic events in tests have no capture */
    }
  }

  function onPointerMove(event: PointerEvent): void {
    const start = pointerStart
    if (!start || start.pointerId !== event.pointerId) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!pointerPanned && Math.abs(dx) < VIDEO_PAN_SLOP_PX && Math.abs(dy) < VIDEO_PAN_SLOP_PX) {
      return
    }
    if (!pointerPanned) {
      pointerPanned = true
      panStartedAt = performance.now()
    }
    panX.value = clampPan(start.pan - dx / start.scaleX)
    recordPanSample(panX.value)
  }

  function onPointerUp(event: PointerEvent): void {
    const start = pointerStart
    const wasPan = pointerPanned
    pointerStart = null
    pointerPanned = false
    if (!start || start.pointerId !== event.pointerId) return
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    if (wasPan) {
      const duration = panStartedAt > 0 ? performance.now() - panStartedAt : Number.POSITIVE_INFINITY
      const velocity =
        duration <= PAN_SWIPE_MAX_MS ? panVelocityFromSamples() * PAN_FLING_VELOCITY_SCALE : 0
      panSamples = []
      panStartedAt = 0
      startPanInertia(velocity)
      return
    }
    panSamples = []
  }

  function onPointerCancel(): void {
    pointerStart = null
    pointerPanned = false
    panStartedAt = 0
    panSamples = []
    stopPanInertia()
  }

  watch(
    () => options.enabled.value,
    (enabled) => {
      if (!enabled) stopPanInertia()
    },
  )

  watch(options.aspect, () => {
    didCenterPan = false
    measureStage()
  })

  watch(options.stage, (el) => {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (!el || typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver(() => measureStage())
    resizeObserver.observe(el)
    measureStage()
  })

  onBeforeUnmount(() => {
    stopPanInertia()
    resizeObserver?.disconnect()
  })

  return {
    planeStyle,
    planeReady,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    measureStage,
    resetPan,
  }
}
