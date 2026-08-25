<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  clampHazardRadius,
  MAX_HAZARD_RADIUS,
  MIN_HAZARD_RADIUS,
} from '@/lib/hazards/constants'
import { getHazardStateAtTime } from '@/lib/hazards/interpolate'
import {
  addSizeKeyframeAtTime,
  removeTrajectoryPoint,
  sampleSizePath,
  updateTrajectoryPoint,
} from '@/lib/hazards/trajectory-path'
import { FRAME_STEP_SECONDS, formatTimelineTime, MIN_HAZARD_DURATION } from '@/lib/timeline/format'
import { hazardDetailsLabel } from '@/types/hazard'
import type { TrajectoryPoint } from '@/types/hazard'
import type { SeeHazard } from '@/types/see'

type RangeDragMode = 'start' | 'end' | 'move'
type RangeDragState = {
  hazardId: string
  mode: RangeDragMode
  startTime: number
  endTime: number
  originTime: number
}

const SIZE_DRAG_THRESHOLD_PX = 4

const props = defineProps<{
  duration: number
  currentTime: number
  hazards: SeeHazard[]
  selectedHazardId: string | null
  addDisabled?: boolean
  removeDisabled?: boolean
  isPlaying?: boolean
}>()

const emit = defineEmits<{
  selectHazard: [id: string | null]
  seek: [time: number]
  hazardTimesChange: [hazard: SeeHazard, startTime: number, endTime: number]
  trajectoryChange: [hazard: SeeHazard, trajectory: TrajectoryPoint[]]
  addHazard: []
  removeHazard: []
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
const activeTrajectory = computed(
  () => sizePreview.value ?? selectedHazard.value?.trajectory ?? [],
)

watch(
  () => props.selectedHazardId,
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
  const rect = trackRef.value?.getBoundingClientRect()
  if (!rect || props.duration <= 0) return 0
  const ratio = (clientX - rect.left) / rect.width
  return clampTime(ratio * props.duration, props.duration)
}

function radiusFromClientY(clientY: number) {
  const rect = trackRef.value?.getBoundingClientRect()
  if (!rect) return MIN_HAZARD_RADIUS
  const ratio = 1 - (clientY - rect.top) / rect.height
  return percentToRadius(ratio * 100)
}

function beginRangeDrag(event: PointerEvent, hazard: SeeHazard, mode: RangeDragMode) {
  if (event.button !== 0) return
  event.stopPropagation()
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  emit('selectHazard', hazard.id)
  selectedKeyframeIndex.value = null
  rangeDrag.value = {
    hazardId: hazard.id,
    mode,
    startTime: hazard.startTime,
    endTime: hazard.endTime,
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

  rangePreview.value = { ...rangePreview.value, [drag.hazardId]: { start, end } }
}

function onRangePointerUp() {
  const drag = rangeDrag.value
  if (!drag) return
  const hazard = props.hazards.find((item) => item.id === drag.hazardId)
  const times = rangePreview.value[drag.hazardId]
  rangeDrag.value = null
  if (hazard && times) {
    emit('hazardTimesChange', hazard, times.start, times.end)
  }
  const next = { ...rangePreview.value }
  delete next[drag.hazardId]
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

function handleTrackClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('[data-hazard]') || target.dataset.sizeHandle) return
  if (target.dataset.sizeCurve) return
  emit('seek', timeFromClientX(event.clientX))
  selectedKeyframeIndex.value = null
}

function handleSizeCurveClick(event: MouseEvent) {
  event.stopPropagation()
  if (!selectedHazard.value) return
  const time = timeFromClientX(event.clientX)
  if (time < selectedHazard.value.startTime || time > selectedHazard.value.endTime) return
  const radius = radiusFromClientY(event.clientY)
  const next = addSizeKeyframeAtTime(selectedHazard.value, time, radius)
  emit('trajectoryChange', selectedHazard.value, next)
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
  const next = removeTrajectoryPoint(selectedHazard.value.trajectory, selectedKeyframeIndex.value)
  if (!next) return
  emit('trajectoryChange', selectedHazard.value, next)
  selectedKeyframeIndex.value = null
}

function addKeyframeAtPlayhead() {
  if (!selectedHazard.value) return
  if (
    props.currentTime < selectedHazard.value.startTime ||
    props.currentTime > selectedHazard.value.endTime
  ) {
    return
  }
  const state = getHazardStateAtTime(selectedHazard.value, props.currentTime)
  const radius = state?.radius ?? selectedHazard.value.radius
  const next = addSizeKeyframeAtTime(selectedHazard.value, props.currentTime, radius)
  emit('trajectoryChange', selectedHazard.value, next)
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
    const base = sizePreview.value ?? hazard.trajectory
    sizePreview.value = updateTrajectoryPoint(base, index, { radius })
  }

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    sizeDragCleanup = null
    if (dragging && sizePreview.value) {
      emit('trajectoryChange', hazard, sizePreview.value)
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
  if (!selectedHazard.value) return ''
  return sampleSizePath({
    id: selectedHazard.value.id,
    startTime: selectedHazard.value.startTime,
    endTime: selectedHazard.value.endTime,
    trajectory: activeTrajectory.value,
    radius: selectedHazard.value.radius,
  })
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
    props.currentTime < selectedHazard.value.startTime ||
    props.currentTime > selectedHazard.value.endTime
  ) {
    return null
  }
  return (
    getHazardStateAtTime(selectedHazard.value, props.currentTime)?.radius ??
    selectedHazard.value.radius
  )
})

const canRemoveKeyframe = computed(
  () => selectedKeyframeIndex.value != null && activeTrajectory.value.length > 2,
)

function hazardTimes(hazard: SeeHazard) {
  return rangePreview.value[hazard.id] ?? { start: hazard.startTime, end: hazard.endTime }
}

function hazardStyle(hazard: SeeHazard) {
  const times = hazardTimes(hazard)
  const left = props.duration > 0 ? (times.start / props.duration) * 100 : 0
  const width = props.duration > 0 ? ((times.end - times.start) / props.duration) * 100 : 0
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
        Drag hazard to move · click size line to add keyframe · drag dots for size
      </p>
      <div class="see-track-actions">
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
            currentTime < (selectedHazard?.startTime ?? 0) ||
            currentTime > (selectedHazard?.endTime ?? 0)
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
      @click="handleTrackClick"
    >
      <div
        v-for="(hazard, index) in hazards"
        :key="hazard.id"
        data-hazard
        class="see-clip"
        :class="{ selected: selectedHazardId === hazard.id }"
        :style="hazardStyle(hazard)"
        @click.stop="$emit('selectHazard', hazard.id); selectedKeyframeIndex = null"
      >
        <button
          type="button"
          class="see-clip-handle"
          aria-label="Drag hazard start"
          @pointerdown="beginRangeDrag($event, hazard, 'start')"
        />
        <button
          type="button"
          class="see-clip-move"
          aria-label="Move hazard"
          @pointerdown="beginRangeDrag($event, hazard, 'move')"
        >
          {{ hazardDetailsLabel(hazard, `H${index + 1}`) }}
        </button>
        <button
          type="button"
          class="see-clip-handle"
          aria-label="Drag hazard end"
          @pointerdown="beginRangeDrag($event, hazard, 'end')"
        />
      </div>

      <svg
        v-if="selectedHazard && curvePoints"
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
        v-for="(point, index) in selectedHazard ? activeTrajectory : []"
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

      <div class="see-playhead" :style="{ left: `${playheadPercent}%` }" />
      <div v-if="currentRadius != null" class="see-radius-badge">{{ currentRadius.toFixed(1) }}%</div>
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
