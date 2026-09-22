<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  clampHazardRadius,
  MAX_HAZARD_RADIUS,
  MIN_HAZARD_RADIUS,
} from '@/lib/hazards/constants'
import { interpolateTrajectoryAtTime } from '@/lib/hazards/interpolate'
import {
  addSizeKeyframeAtTime,
  removeTrajectoryPoint,
  sampleSizePath,
  updateTrajectoryPoint,
} from '@/lib/hazards/trajectory-path'
import { FRAME_STEP_SECONDS, formatTimelineTime, MIN_HAZARD_DURATION } from '@/lib/timeline/format'
import { hazardDetailsLabel, hazardTriggerTrajectories, trajectoryWindow } from '@/types/hazard'
import type { TrajectoryPoint } from '@/types/hazard'
import type { SeeHazard } from '@/types/see'

type RangeDragMode = 'start' | 'end' | 'move'
type RangeDragState = {
  hazardId: string
  triggerIndex: number
  mode: RangeDragMode
  startTime: number
  endTime: number
  originTime: number
}

type TimelineClip = {
  key: string
  hazard: SeeHazard
  triggerIndex: number
  label: string
  start: number
  end: number
  selected: boolean
}

const SIZE_DRAG_THRESHOLD_PX = 4

const props = defineProps<{
  duration: number
  currentTime: number
  hazards: SeeHazard[]
  selectedHazardId: string | null
  selectedTriggerIndex?: number
  addDisabled?: boolean
  removeDisabled?: boolean
  isPlaying?: boolean
}>()

const emit = defineEmits<{
  selectHazard: [id: string | null]
  selectTrigger: [index: number]
  seek: [time: number]
  hazardTimesChange: [hazard: SeeHazard, startTime: number, endTime: number, triggerIndex: number]
  trajectoryChange: [hazard: SeeHazard, trajectory: TrajectoryPoint[], triggerIndex: number]
  addHazard: []
  removeHazard: []
  addTrigger: []
  removeTrigger: []
  togglePlay: []
}>()

const trackRef = ref<HTMLDivElement | null>(null)
const rangeDrag = ref<RangeDragState | null>(null)
const rangePreview = ref<Record<string, { start: number; end: number }>>({})
const sizePreview = ref<TrajectoryPoint[] | null>(null)
const selectedKeyframeIndex = ref<number | null>(null)
let sizeDragCleanup: (() => void) | null = null

const selectedHazard = computed(
  () => props.hazards.find((hazard) => hazard.id === props.selectedHazardId) ?? null,
)
const triggerTrajectories = computed(() =>
  selectedHazard.value ? hazardTriggerTrajectories(selectedHazard.value) : [],
)
const selectedTriggerIndex = computed(() => {
  const last = Math.max(0, triggerTrajectories.value.length - 1)
  return Math.min(Math.max(0, props.selectedTriggerIndex ?? 0), last)
})
const storedSelectedTrajectory = computed(
  () => triggerTrajectories.value[selectedTriggerIndex.value] ?? [],
)
const editingHazard = computed(() => {
  if (!selectedHazard.value) return null
  const trajectory = storedSelectedTrajectory.value
  const window = trajectoryWindow(trajectory) ?? {
    startTime: selectedHazard.value.startTime,
    endTime: selectedHazard.value.endTime,
  }
  return {
    ...selectedHazard.value,
    ...window,
    trajectory,
  }
})
const activeTrajectory = computed(
  () => sizePreview.value ?? storedSelectedTrajectory.value,
)
const triggerCount = computed(() => triggerTrajectories.value.length)
const canRemoveTrigger = computed(() => triggerCount.value > 1)
const selectedTriggerWindow = computed(() => {
  if (!selectedHazard.value) return null
  return (
    trajectoryWindow(storedSelectedTrajectory.value) ?? {
      startTime: selectedHazard.value.startTime,
      endTime: selectedHazard.value.endTime,
    }
  )
})

function clipKey(hazardId: string, triggerIndex: number): string {
  return `${hazardId}:${triggerIndex}`
}

watch(
  () => [props.selectedHazardId, props.selectedTriggerIndex] as const,
  () => {
    selectedKeyframeIndex.value = null
  },
)

function clampTime(value: number, max: number) {
  return Math.min(max, Math.max(0, value))
}

function radiusToPercent(radius: number) {
  const range = MAX_HAZARD_RADIUS - MIN_HAZARD_RADIUS
  return ((clampHazardRadius(radius) - MIN_HAZARD_RADIUS) / range) * 100
}

function percentToRadius(percent: number) {
  const range = MAX_HAZARD_RADIUS - MIN_HAZARD_RADIUS
  return clampHazardRadius(MIN_HAZARD_RADIUS + (percent / 100) * range)
}

function timeFromClientX(clientX: number) {
  const rect = timeAxisRect()
  if (!rect || props.duration <= 0) return 0
  const ratio = (clientX - rect.left) / rect.width
  return clampTime(ratio * props.duration, props.duration)
}

function timeAxisRect() {
  return (
    trackRef.value?.querySelector('.see-track-lane-body')?.getBoundingClientRect() ??
    trackRef.value?.getBoundingClientRect()
  )
}

function selectedLaneRect() {
  return (
    trackRef.value?.querySelector('.see-track-lane.is-selected')?.getBoundingClientRect() ??
    trackRef.value?.getBoundingClientRect()
  )
}

function radiusFromClientY(clientY: number) {
  const rect = selectedLaneRect()
  if (!rect) return MIN_HAZARD_RADIUS
  const ratio = 1 - (clientY - rect.top) / rect.height
  return percentToRadius(ratio * 100)
}

function beginRangeDrag(event: PointerEvent, clip: TimelineClip, mode: RangeDragMode) {
  if (event.button !== 0) return
  event.stopPropagation()
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  emit('selectHazard', clip.hazard.id)
  emit('selectTrigger', clip.triggerIndex)
  selectedKeyframeIndex.value = null
  rangeDrag.value = {
    hazardId: clip.hazard.id,
    triggerIndex: clip.triggerIndex,
    mode,
    startTime: clip.start,
    endTime: clip.end,
    originTime: timeFromClientX(event.clientX),
  }
}

function onRangePointerMove(event: PointerEvent) {
  const drag = rangeDrag.value
  if (!drag) return
  const time = timeFromClientX(event.clientX)
  let start = drag.startTime
  let end = drag.endTime
  const span = drag.endTime - drag.startTime

  if (drag.mode === 'start') {
    start = clampTime(Math.min(time, end - MIN_HAZARD_DURATION), props.duration)
  } else if (drag.mode === 'end') {
    end = clampTime(Math.max(time, start + MIN_HAZARD_DURATION), props.duration)
  } else {
    const delta = time - drag.originTime
    start = clampTime(drag.startTime + delta, props.duration - span)
    end = start + span
  }

  rangePreview.value = {
    ...rangePreview.value,
    [clipKey(drag.hazardId, drag.triggerIndex)]: { start, end },
  }
}

function onRangePointerUp() {
  const drag = rangeDrag.value
  if (!drag) return
  const hazard = props.hazards.find((item) => item.id === drag.hazardId)
  const key = clipKey(drag.hazardId, drag.triggerIndex)
  const times = rangePreview.value[key]
  rangeDrag.value = null
  if (hazard && times) {
    emit('hazardTimesChange', hazard, times.start, times.end, drag.triggerIndex)
  }
  const next = { ...rangePreview.value }
  delete next[key]
  rangePreview.value = next
}

watch(rangeDrag, (drag, previous) => {
  if (previous && !drag) {
    window.removeEventListener('pointermove', onRangePointerMove)
    window.removeEventListener('pointerup', onRangePointerUp)
  }
  if (drag && !previous) {
    window.addEventListener('pointermove', onRangePointerMove)
    window.addEventListener('pointerup', onRangePointerUp)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onRangePointerMove)
  window.removeEventListener('pointerup', onRangePointerUp)
  sizeDragCleanup?.()
})

function isTrackScrubTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[data-hazard]') || target.dataset.sizeHandle) return false
  return !target.dataset.sizeCurve
}

function handleTrackPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !isTrackScrubTarget(event.target)) return
  event.preventDefault()
  selectedKeyframeIndex.value = null
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  emit('seek', timeFromClientX(event.clientX))
}

function handleTrackPointerMove(event: PointerEvent) {
  const el = event.currentTarget as HTMLElement
  if (!el.hasPointerCapture(event.pointerId)) return
  emit('seek', timeFromClientX(event.clientX))
}

function handleSizeCurveClick(event: MouseEvent) {
  event.stopPropagation()
  if (!selectedHazard.value) return
  const time = timeFromClientX(event.clientX)
  if (time < (selectedTriggerWindow.value?.startTime ?? 0) || time > (selectedTriggerWindow.value?.endTime ?? 0)) return
  const radius = radiusFromClientY(event.clientY)
  const next = addSizeKeyframeAtTime(editingHazard.value ?? selectedHazard.value, time, radius)
  emit('trajectoryChange', selectedHazard.value, next, selectedTriggerIndex.value)
  const nearest = next.reduce(
    (best, point, index) => {
      const distance = Math.abs(point.time - time)
      return distance < best.distance ? { index, distance } : best
    },
    { index: 0, distance: Number.POSITIVE_INFINITY },
  )
  selectedKeyframeIndex.value = nearest.index
  emit('seek', time)
}

function handleRemoveSelectedKeyframe() {
  if (!selectedHazard.value || selectedKeyframeIndex.value == null) return
  const next = removeTrajectoryPoint(storedSelectedTrajectory.value, selectedKeyframeIndex.value)
  if (!next) return
  emit('trajectoryChange', selectedHazard.value, next, selectedTriggerIndex.value)
  selectedKeyframeIndex.value = null
}

function addKeyframeAtPlayhead() {
  if (!selectedHazard.value) return
  if (
    props.currentTime < (selectedTriggerWindow.value?.startTime ?? 0) ||
    props.currentTime > (selectedTriggerWindow.value?.endTime ?? 0)
  ) {
    return
  }
  const state = interpolateTrajectoryAtTime(
    selectedHazard.value,
    storedSelectedTrajectory.value,
    props.currentTime,
  )
  const radius = state?.radius ?? selectedHazard.value.radius
  const next = addSizeKeyframeAtTime(editingHazard.value ?? selectedHazard.value, props.currentTime, radius)
  emit('trajectoryChange', selectedHazard.value, next, selectedTriggerIndex.value)
  const nearest = next.reduce(
    (best, point, index) => {
      const distance = Math.abs(point.time - props.currentTime)
      return distance < best.distance ? { index, distance } : best
    },
    { index: 0, distance: Number.POSITIVE_INFINITY },
  )
  selectedKeyframeIndex.value = nearest.index
}

function beginSizeKeyframePointer(event: PointerEvent, index: number) {
  if (!selectedHazard.value) return
  event.stopPropagation()
  event.preventDefault()
  selectedKeyframeIndex.value = index

  const originX = event.clientX
  const originY = event.clientY
  let dragging = false
  const hazard = selectedHazard.value

  const onPointerMove = (moveEvent: PointerEvent) => {
    if (!dragging) {
      const dx = moveEvent.clientX - originX
      const dy = moveEvent.clientY - originY
      if (Math.hypot(dx, dy) < SIZE_DRAG_THRESHOLD_PX) return
      dragging = true
    }
    const radius = radiusFromClientY(moveEvent.clientY)
    const base = sizePreview.value ?? storedSelectedTrajectory.value
    sizePreview.value = updateTrajectoryPoint(base, index, { radius })
  }

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    sizeDragCleanup = null
    if (dragging && sizePreview.value) {
      emit('trajectoryChange', hazard, sizePreview.value, selectedTriggerIndex.value)
    }
    sizePreview.value = null
  }

  sizeDragCleanup?.()
  sizeDragCleanup = onPointerUp
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

const playheadPercent = computed(() =>
  props.duration > 0 ? (props.currentTime / props.duration) * 100 : 0,
)

const curvePoints = computed(() => {
  if (!editingHazard.value) return ''
  return sampleSizePath(editingHazard.value)
    .map((sample) => {
      const x = props.duration > 0 ? (sample.time / props.duration) * 100 : 0
      const y = 100 - radiusToPercent(sample.radius)
      return `${x},${y}`
    })
    .join(' ')
})

const currentRadius = computed(() => {
  if (
    !selectedHazard.value ||
    !selectedTriggerWindow.value ||
    props.currentTime < selectedTriggerWindow.value.startTime ||
    props.currentTime > selectedTriggerWindow.value.endTime
  ) {
    return null
  }
  return (
    interpolateTrajectoryAtTime(
      selectedHazard.value,
      storedSelectedTrajectory.value,
      props.currentTime,
    )?.radius ?? selectedHazard.value.radius
  )
})

const canRemoveKeyframe = computed(
  () => selectedKeyframeIndex.value != null && activeTrajectory.value.length > 2,
)

const clips = computed((): TimelineClip[] =>
  props.hazards.flatMap((hazard, hazardIndex) => {
    const trajectories = hazardTriggerTrajectories(hazard)
    const items = trajectories.length > 0 ? trajectories : [hazard.trajectory]
    const fallback = { startTime: hazard.startTime, endTime: hazard.endTime }
    return items.map((trajectory, triggerIndex) => {
      const window = trajectoryWindow(trajectory) ?? fallback
      const preview = rangePreview.value[clipKey(hazard.id, triggerIndex)]
      const selected =
        props.selectedHazardId === hazard.id && selectedTriggerIndex.value === triggerIndex
      const baseLabel = hazardDetailsLabel(hazard, `H${hazardIndex + 1}`)
      return {
        key: clipKey(hazard.id, triggerIndex),
        hazard,
        triggerIndex,
        label: items.length > 1 ? `${baseLabel} · T${triggerIndex + 1}` : baseLabel,
        start: preview?.start ?? window.startTime,
        end: preview?.end ?? window.endTime,
        selected,
      }
    })
  }),
)

function clipStyle(clip: TimelineClip) {
  const left = props.duration > 0 ? (clip.start / props.duration) * 100 : 0
  const width = props.duration > 0 ? ((clip.end - clip.start) / props.duration) * 100 : 0
  return { left: `${left}%`, width: `${Math.max(width, 1)}%` }
}

function keyframeStyle(point: TrajectoryPoint) {
  const left = props.duration > 0 ? (point.time / props.duration) * 100 : 0
  const top = 100 - radiusToPercent(point.radius ?? selectedHazard.value?.radius ?? 6)
  return { left: `${left}%`, top: `${top}%` }
}

function stepFrame(direction: -1 | 1) {
  emit('seek', props.currentTime + direction * FRAME_STEP_SECONDS)
}
</script>

<template>
  <div class="see-track-wrap">
    <div class="see-track-toolbar">
      <p class="see-track-hint">
        Drag a trigger to set its own start and end · click size line to add keyframe · drag dots
        for size. Extra trigger points share this hazard's three attempts.
      </p>
      <div class="see-track-actions">
        <button
          v-if="selectedHazard && triggerCount > 1"
          type="button"
          class="see-mini-btn"
          title="Switch which trigger point you are editing"
          @click="$emit('selectTrigger', (selectedTriggerIndex + 1) % triggerCount)"
        >
          Trigger {{ selectedTriggerIndex + 1 }} of {{ triggerCount }}
        </button>
        <button
          v-if="selectedHazard"
          type="button"
          class="see-mini-btn"
          :disabled="removeDisabled"
          @click="$emit('addTrigger')"
        >
          Add trigger point
        </button>
        <button
          v-if="selectedHazard && canRemoveTrigger"
          type="button"
          class="see-mini-btn"
          :disabled="removeDisabled"
          @click="$emit('removeTrigger')"
        >
          Remove trigger
        </button>
        <button
          v-if="selectedHazard"
          type="button"
          class="see-mini-btn"
          :disabled="removeDisabled"
          @click="$emit('removeHazard')"
        >
          Remove Hazard
        </button>
        <button
          v-if="selectedKeyframeIndex != null"
          type="button"
          class="see-mini-btn"
          :disabled="!canRemoveKeyframe"
          title="Remove selected size keyframe"
          @click="handleRemoveSelectedKeyframe"
        >
          Remove keyframe
        </button>
        <button
          v-else
          type="button"
          class="see-mini-btn"
          :disabled="
            !selectedHazard ||
            !selectedTriggerWindow ||
            currentTime < selectedTriggerWindow.startTime ||
            currentTime > selectedTriggerWindow.endTime
          "
          @click="addKeyframeAtPlayhead"
        >
          Add size keyframe
        </button>
        <button
          type="button"
          class="see-mini-btn is-outline"
          :disabled="addDisabled"
          @click="$emit('addHazard')"
        >
          Add Hazard
        </button>
      </div>
    </div>

    <div
      ref="trackRef"
      class="see-track"
      role="slider"
      aria-label="Hazard timeline"
      :aria-valuemin="0"
      :aria-valuemax="duration"
      :aria-valuenow="currentTime"
      @pointerdown="handleTrackPointerDown"
      @pointermove="handleTrackPointerMove"
    >
      <div
        v-for="clip in clips"
        :key="clip.key"
        class="see-track-lane"
        :class="{ 'is-selected': clip.selected }"
      >
        <p class="see-track-lane-label">T{{ clip.triggerIndex + 1 }}</p>
        <div
          data-hazard
          class="see-track-lane-body"
        >
          <div
            class="see-clip"
            :class="{ selected: clip.selected, 'is-other-trigger': !clip.selected }"
            :style="clipStyle(clip)"
            @click.stop="
              $emit('selectHazard', clip.hazard.id);
              $emit('selectTrigger', clip.triggerIndex);
              selectedKeyframeIndex = null
            "
          >
            <button
              type="button"
              class="see-clip-handle"
              :aria-label="`Drag trigger ${clip.triggerIndex + 1} start`"
              @pointerdown="beginRangeDrag($event, clip, 'start')"
            />
            <button
              type="button"
              class="see-clip-move"
              :aria-label="`Move trigger ${clip.triggerIndex + 1}`"
              @pointerdown="beginRangeDrag($event, clip, 'move')"
            >
              {{ clip.label }}
            </button>
            <button
              type="button"
              class="see-clip-handle"
              :aria-label="`Drag trigger ${clip.triggerIndex + 1} end`"
              @pointerdown="beginRangeDrag($event, clip, 'end')"
            />
          </div>

          <template v-if="clip.selected && selectedHazard">
            <svg
              v-if="curvePoints"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              class="see-size-curve"
              aria-hidden="true"
            >
              <polyline
                data-size-curve="true"
                :points="curvePoints"
                fill="none"
                stroke="transparent"
                stroke-width="12"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
                class="see-size-curve-hit"
                @click="handleSizeCurveClick"
              />
              <polyline
                data-size-curve="true"
                :points="curvePoints"
                fill="none"
                stroke="#ff2f94"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <button
              v-for="(point, index) in activeTrajectory"
              :key="`${point.time}-${index}`"
              type="button"
              data-size-handle="true"
              class="see-size-dot"
              :class="{ selected: selectedKeyframeIndex === index }"
              :style="keyframeStyle(point)"
              :aria-label="`Size keyframe at ${point.time.toFixed(2)}s`"
              :title="`${point.time.toFixed(2)}s · ${(point.radius ?? selectedHazard?.radius ?? 0).toFixed(1)}%`"
              @click.stop="selectedKeyframeIndex = index"
              @pointerdown="beginSizeKeyframePointer($event, index)"
            />
            <div
              v-if="currentRadius != null"
              class="see-radius-badge"
            >
              {{ currentRadius.toFixed(1) }}%
            </div>
          </template>
          <div class="see-playhead" :style="{ left: `${playheadPercent}%` }" />
        </div>
      </div>
    </div>

    <div class="see-playbar">
      <input
        type="range"
        class="see-playbar-input"
        :min="0"
        :max="duration || 0"
        step="0.001"
        :value="Math.min(currentTime, duration || 0)"
        :disabled="duration <= 0"
        aria-label="Seek playhead"
        @input="
          selectedKeyframeIndex = null;
          $emit('seek', parseFloat(($event.target as HTMLInputElement).value))
        "
      />
      <div class="see-playbar-row">
        <div class="see-track-actions">
          <button type="button" class="see-mini-btn" :disabled="duration <= 0" @click="$emit('togglePlay')">
            {{ isPlaying ? 'Pause' : 'Play' }}
          </button>
          <button
            type="button"
            class="see-mini-btn"
            :disabled="duration <= 0"
            title="Step back one frame"
            @click="stepFrame(-1)"
          >
            F -
          </button>
          <button
            type="button"
            class="see-mini-btn"
            :disabled="duration <= 0"
            title="Step forward one frame"
            @click="stepFrame(1)"
          >
            F +
          </button>
        </div>
        <div class="see-time">
          <span>{{ formatTimelineTime(currentTime) }}</span>
          <span>/</span>
          <span>{{ formatTimelineTime(duration) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
