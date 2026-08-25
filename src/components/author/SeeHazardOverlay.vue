<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  clientToPercent,
  videoContentRectRelative,
  type ContentRect,
} from '@/lib/hazards/coordinates'
import { hazardMarkerDiameterPercent } from '@/lib/hazards/constants'
import { getHazardStateAtTime } from '@/lib/hazards/interpolate'
import {
  addTrajectoryPoint,
  removeTrajectoryPoint,
  sampleTrajectoryPath,
  trajectoryToPolyline,
  updateTrajectoryPoint,
} from '@/lib/hazards/trajectory-path'
import type { TrajectoryPoint } from '@/types/hazard'
import type { SeeHazard } from '@/types/see'

const props = defineProps<{
  video: HTMLVideoElement | null
  currentTime: number
  hazards: SeeHazard[]
  selectedHazardId: string | null
}>()

const emit = defineEmits<{
  trajectoryChange: [hazard: SeeHazard, trajectory: TrajectoryPoint[]]
}>()

const container = ref<HTMLElement | null>(null)
const contentRect = ref<ContentRect | null>(null)
const selectedPointIndex = ref<number | null>(null)
const previewTrajectory = ref<TrajectoryPoint[] | null>(null)
const dragIndex = ref<number | null>(null)

const selectedHazard = computed(
  () => props.hazards.find((hazard) => hazard.id === props.selectedHazardId) ?? null,
)
const activeTrajectory = computed(
  () => previewTrajectory.value ?? selectedHazard.value?.trajectory ?? null,
)

function refreshRect(): void {
  if (!props.video || !container.value) {
    contentRect.value = null
    return
  }
  contentRect.value = videoContentRectRelative(props.video, container.value)
}

function inactiveStyle(hazard: SeeHazard) {
  const state = getHazardStateAtTime(hazard, props.currentTime)
  const rect = contentRect.value
  if (!state || !rect) return { display: 'none' }
  const diameter = hazardMarkerDiameterPercent(state.radius)
  return {
    left: `${rect.left + (state.x / 100) * rect.width}px`,
    top: `${rect.top + (state.y / 100) * rect.height}px`,
    width: `${(diameter / 100) * rect.width}px`,
    height: `${(diameter / 100) * rect.width}px`,
  }
}

watch(
  () => props.selectedHazardId,
  () => {
    selectedPointIndex.value = null
    previewTrajectory.value = null
  },
)

watch(
  () => props.video,
  (video, previous) => {
    previous?.removeEventListener('loadedmetadata', refreshRect)
    video?.addEventListener('loadedmetadata', refreshRect)
    refreshRect()
  },
  { immediate: true },
)

onMounted(() => {
  refreshRect()
  window.addEventListener('resize', refreshRect)
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', refreshRect)
  props.video?.removeEventListener('loadedmetadata', refreshRect)
  window.removeEventListener('keydown', onKeyDown)
})

function onKeyDown(event: KeyboardEvent): void {
  if (
    (event.key !== 'Delete' && event.key !== 'Backspace') ||
    !selectedHazard.value ||
    selectedPointIndex.value == null ||
    !activeTrajectory.value
  ) {
    return
  }
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
    return
  }
  event.preventDefault()
  const next = removeTrajectoryPoint(activeTrajectory.value, selectedPointIndex.value)
  if (!next) return
  previewTrajectory.value = null
  selectedPointIndex.value = null
  emit('trajectoryChange', selectedHazard.value, next)
}

function handleCanvasClick(event: MouseEvent): void {
  if (!selectedHazard.value || !props.video) return
  if ((event.target as HTMLElement).dataset.keyframe) return

  const { x, y } = clientToPercent(event.clientX, event.clientY, props.video)
  if (
    props.currentTime < selectedHazard.value.startTime ||
    props.currentTime > selectedHazard.value.endTime
  ) {
    return
  }

  const state = getHazardStateAtTime(selectedHazard.value, props.currentTime)
  const next = addTrajectoryPoint(
    activeTrajectory.value ?? selectedHazard.value.trajectory,
    {
      time: props.currentTime,
      x,
      y,
      radius: state?.radius ?? selectedHazard.value.radius,
    },
    selectedHazard.value.startTime,
    selectedHazard.value.endTime,
  )
  previewTrajectory.value = null
  emit('trajectoryChange', selectedHazard.value, next)
}

function handlePointPointerDown(event: PointerEvent, index: number): void {
  event.stopPropagation()
  if (!selectedHazard.value) return
  selectedPointIndex.value = index
  dragIndex.value = index
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function handlePointPointerMove(event: PointerEvent): void {
  const index = dragIndex.value
  if (index == null || !selectedHazard.value || !props.video) return
  const { x, y } = clientToPercent(event.clientX, event.clientY, props.video)
  const base = previewTrajectory.value ?? selectedHazard.value.trajectory
  previewTrajectory.value = updateTrajectoryPoint(base, index, { x, y })
}

function handlePointPointerUp(event: PointerEvent): void {
  if (dragIndex.value == null || !selectedHazard.value) return
  dragIndex.value = null
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  if (previewTrajectory.value) {
    emit('trajectoryChange', selectedHazard.value, previewTrajectory.value)
    previewTrajectory.value = null
  }
}

const pathPoints = computed(() =>
  selectedHazard.value && activeTrajectory.value
    ? sampleTrajectoryPath({
        id: selectedHazard.value.id,
        startTime: selectedHazard.value.startTime,
        endTime: selectedHazard.value.endTime,
        trajectory: activeTrajectory.value,
        radius: selectedHazard.value.radius,
      })
    : [],
)

const previewState = computed(() => {
  if (!selectedHazard.value || !activeTrajectory.value) return null
  return getHazardStateAtTime(
    {
      id: selectedHazard.value.id,
      startTime: selectedHazard.value.startTime,
      endTime: selectedHazard.value.endTime,
      trajectory: activeTrajectory.value,
      radius: selectedHazard.value.radius,
    },
    props.currentTime,
  )
})

const inactiveHazards = computed(() =>
  props.hazards.filter((hazard) => hazard.id !== props.selectedHazardId),
)
</script>

<template>
  <div ref="container" class="see-overlay">
    <template v-if="contentRect">
      <div
        v-for="hazard in inactiveHazards"
        :key="hazard.id"
        class="see-overlay-marker is-inactive"
        :style="inactiveStyle(hazard)"
        aria-hidden="true"
      />

      <div
        v-if="selectedHazard"
        class="see-overlay-canvas"
        :style="{
          left: `${contentRect.left}px`,
          top: `${contentRect.top}px`,
          width: `${contentRect.width}px`,
          height: `${contentRect.height}px`,
        }"
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="see-overlay-path" aria-hidden="true">
          <polyline
            :points="trajectoryToPolyline(pathPoints)"
            fill="none"
            stroke="white"
            stroke-width="0.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>

        <div
          v-if="previewState"
          class="see-overlay-marker"
          :style="{
            left: `${previewState.x}%`,
            top: `${previewState.y}%`,
            width: `${hazardMarkerDiameterPercent(previewState.radius)}%`,
          }"
          aria-hidden="true"
        />

        <div class="see-overlay-hit" aria-label="Click to add trajectory point at current time" @click="handleCanvasClick">
          <div
            v-for="(point, index) in activeTrajectory ?? []"
            :key="`${point.time}-${index}`"
            class="see-overlay-keyframe"
            :class="{ selected: selectedPointIndex === index }"
            data-keyframe="true"
            :style="{ left: `${point.x}%`, top: `${point.y}%` }"
            :title="`${point.time.toFixed(2)}s · (${point.x.toFixed(0)}, ${point.y.toFixed(0)})`"
            @click.stop="selectedPointIndex = index"
            @pointerdown="handlePointPointerDown($event, index)"
            @pointermove="handlePointPointerMove"
            @pointerup="handlePointPointerUp"
          />
        </div>
      </div>
    </template>
  </div>
</template>
