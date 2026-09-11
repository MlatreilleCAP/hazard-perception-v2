<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  clientToPercent,
  videoContentRectRelative,
  type ContentRect,
} from '@/lib/hazards/coordinates'
import { hazardMarkerDiameterPercent } from '@/lib/hazards/constants'
import {
  getHazardStatesAtTime,
  interpolateTrajectoryAtTime,
} from '@/lib/hazards/interpolate'
import {
  addTrajectoryPoint,
  isStaticTrajectory,
  removeTrajectoryPoint,
  repositionTriggerAtTime,
  sampleTrajectoryPath,
  trajectoryToPolyline,
  updateTrajectoryPoint,
} from '@/lib/hazards/trajectory-path'
import { hazardTriggerTrajectories, trajectoryWindow, type TrajectoryPoint } from '@/types/hazard'
import type { SeeHazard } from '@/types/see'

const props = withDefaults(
  defineProps<{
    video: HTMLVideoElement | null
    currentTime: number
    hazards: SeeHazard[]
    selectedHazardId: string | null
    selectedTriggerIndex?: number
    readonly?: boolean
  }>(),
  { readonly: false, selectedTriggerIndex: 0 },
)

const emit = defineEmits<{
  trajectoryChange: [hazard: SeeHazard, trajectory: TrajectoryPoint[], triggerIndex: number]
  selectTrigger: [index: number]
}>()

const container = ref<HTMLElement | null>(null)
const contentRect = ref<ContentRect | null>(null)
const selectedPointIndex = ref<number | null>(null)
const previewTrajectory = ref<TrajectoryPoint[] | null>(null)
const previewTriggerIndex = ref<number | null>(null)
const dragIndex = ref<number | null>(null)
const dragTriggerIndex = ref<number | null>(null)
const dragOrigin = ref<{ x: number; y: number } | null>(null)
const dragBase = ref<TrajectoryPoint[] | null>(null)

const selectedHazard = computed(
  () => props.hazards.find((hazard) => hazard.id === props.selectedHazardId) ?? null,
)
const triggerTrajectories = computed(() =>
  selectedHazard.value ? hazardTriggerTrajectories(selectedHazard.value) : [],
)
const selectedTriggerIndex = computed(() => {
  const last = Math.max(0, triggerTrajectories.value.length - 1)
  return Math.min(Math.max(0, props.selectedTriggerIndex), last)
})
const storedSelectedTrajectory = computed(
  () => triggerTrajectories.value[selectedTriggerIndex.value] ?? null,
)
const editingTriggerIndex = computed(
  () => previewTriggerIndex.value ?? selectedTriggerIndex.value,
)
const activeTrajectory = computed(() => {
  if (previewTrajectory.value && previewTriggerIndex.value === selectedTriggerIndex.value) {
    return previewTrajectory.value
  }
  return storedSelectedTrajectory.value
})

function refreshRect(): void {
  if (!props.video || !container.value) {
    contentRect.value = null
    return
  }
  contentRect.value = videoContentRectRelative(props.video, container.value)
}

function markerStyle(state: { x: number; y: number; radius: number }) {
  const rect = contentRect.value
  if (!rect) return { display: 'none' }
  const diameter = hazardMarkerDiameterPercent(state.radius)
  return {
    left: `${rect.left + (state.x / 100) * rect.width}px`,
    top: `${rect.top + (state.y / 100) * rect.height}px`,
    width: `${(diameter / 100) * rect.width}px`,
    height: `${(diameter / 100) * rect.width}px`,
  }
}

const inactiveMarkers = computed(() => {
  if (!contentRect.value) return []
  return props.hazards
    .filter((hazard) => hazard.id !== props.selectedHazardId)
    .flatMap((hazard) =>
      getHazardStatesAtTime(hazard, props.currentTime).map((state, index) => ({
        key: `${hazard.id}-${index}`,
        style: markerStyle(state),
      })),
    )
})

watch(
  () => [props.selectedHazardId, props.selectedTriggerIndex] as const,
  () => {
    if (dragTriggerIndex.value != null) return
    selectedPointIndex.value = null
    previewTrajectory.value = null
    previewTriggerIndex.value = null
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

function commitTrajectory(trajectory: TrajectoryPoint[], triggerIndex = editingTriggerIndex.value): void {
  if (!selectedHazard.value) return
  emit('trajectoryChange', selectedHazard.value, trajectory, triggerIndex)
}

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
  commitTrajectory(next)
}

function triggerTimeBounds(trajectory: TrajectoryPoint[]): { startTime: number; endTime: number } {
  return (
    trajectoryWindow(trajectory) ?? {
      startTime: selectedHazard.value?.startTime ?? 0,
      endTime: selectedHazard.value?.endTime ?? 0,
    }
  )
}

function handleCanvasClick(event: MouseEvent): void {
  if (props.readonly || !selectedHazard.value || !props.video) return
  const target = event.target as HTMLElement
  if (target.dataset.keyframe || target.dataset.triggerMarker) return

  const { x, y } = clientToPercent(event.clientX, event.clientY, props.video)
  const base = activeTrajectory.value ?? selectedHazard.value.trajectory
  const bounds = triggerTimeBounds(base)
  if (props.currentTime < bounds.startTime || props.currentTime > bounds.endTime) {
    return
  }

  const state = interpolateTrajectoryAtTime(selectedHazard.value, base, props.currentTime)
  const next = addTrajectoryPoint(
    base,
    {
      time: props.currentTime,
      x,
      y,
      radius: state?.radius ?? selectedHazard.value.radius,
    },
    bounds.startTime,
    bounds.endTime,
  )
  previewTrajectory.value = null
  commitTrajectory(next)
}

function selectTrigger(index: number): void {
  emit('selectTrigger', index)
}

function beginTrajectoryDrag(event: PointerEvent, triggerIndex: number): void {
  if (props.readonly || !selectedHazard.value || !props.video) return
  const trajectory = triggerTrajectories.value[triggerIndex]
  if (!trajectory) return
  dragTriggerIndex.value = triggerIndex
  previewTriggerIndex.value = triggerIndex
  if (triggerIndex !== selectedTriggerIndex.value) selectTrigger(triggerIndex)
  dragBase.value = trajectory.map((point) => ({ ...point }))
  dragOrigin.value = clientToPercent(event.clientX, event.clientY, props.video)
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function handleMarkerPointerDown(event: PointerEvent, triggerIndex: number): void {
  event.stopPropagation()
  beginTrajectoryDrag(event, triggerIndex)
}

function handlePointPointerDown(event: PointerEvent, index: number, triggerIndex: number): void {
  event.stopPropagation()
  if (props.readonly || !selectedHazard.value) return
  if (triggerIndex !== selectedTriggerIndex.value) {
    selectTrigger(triggerIndex)
  }
  selectedPointIndex.value = index
  dragIndex.value = index
  previewTriggerIndex.value = triggerIndex
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function handlePointPointerMove(event: PointerEvent): void {
  if (!selectedHazard.value || !props.video) return
  const { x, y } = clientToPercent(event.clientX, event.clientY, props.video)
  if (dragTriggerIndex.value != null && dragOrigin.value && dragBase.value) {
    previewTriggerIndex.value = dragTriggerIndex.value
    const origin = interpolateTrajectoryAtTime(
      selectedHazard.value,
      dragBase.value,
      props.currentTime,
    ) ?? dragBase.value[0]
    if (!origin) return
    const bounds = triggerTimeBounds(dragBase.value)
    previewTrajectory.value = repositionTriggerAtTime(
      dragBase.value,
      origin.x + (x - dragOrigin.value.x),
      origin.y + (y - dragOrigin.value.y),
      props.currentTime,
      bounds.startTime,
      bounds.endTime,
      origin.radius,
    )
    return
  }
  const index = dragIndex.value
  if (index == null) return
  previewTriggerIndex.value = previewTriggerIndex.value ?? selectedTriggerIndex.value
  const base =
    previewTrajectory.value ??
    triggerTrajectories.value[previewTriggerIndex.value] ??
    selectedHazard.value.trajectory
  previewTrajectory.value = isStaticTrajectory(base)
    ? base.map((point) => ({
        ...point,
        x: Math.min(100, Math.max(0, x)),
        y: Math.min(100, Math.max(0, y)),
      }))
    : updateTrajectoryPoint(base, index, { x, y })
}

function handlePointPointerUp(event: PointerEvent): void {
  if (!selectedHazard.value) return
  const triggerIndex = previewTriggerIndex.value ?? selectedTriggerIndex.value
  dragIndex.value = null
  dragTriggerIndex.value = null
  dragOrigin.value = null
  dragBase.value = null
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  if (previewTrajectory.value) {
    commitTrajectory(previewTrajectory.value, triggerIndex)
    previewTrajectory.value = null
    previewTriggerIndex.value = null
  }
}

function trajectoryForIndex(index: number): TrajectoryPoint[] {
  if (previewTrajectory.value && previewTriggerIndex.value === index) {
    return previewTrajectory.value
  }
  return triggerTrajectories.value[index] ?? []
}

const allTriggers = computed(() => {
  if (!selectedHazard.value) return []
  return triggerTrajectories.value.map((_, index) => {
    const trajectory = trajectoryForIndex(index)
    const bounds = triggerTimeBounds(trajectory)
    return {
      index,
      selected: index === selectedTriggerIndex.value,
      points: trajectory,
      path: sampleTrajectoryPath({
        id: selectedHazard.value!.id,
        startTime: bounds.startTime,
        endTime: bounds.endTime,
        trajectory,
        radius: selectedHazard.value!.radius,
      }),
      state: interpolateTrajectoryAtTime(
        selectedHazard.value!,
        trajectory,
        props.currentTime,
      ),
    }
  })
})
</script>

<template>
  <div ref="container" class="see-overlay">
    <template v-if="contentRect">
      <div
        v-for="marker in inactiveMarkers"
        :key="marker.key"
        class="see-overlay-marker is-inactive"
        :style="marker.style"
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
            v-for="trigger in allTriggers"
            :key="`path-${trigger.index}`"
            :points="trajectoryToPolyline(trigger.path)"
            fill="none"
            stroke="white"
            :stroke-opacity="trigger.selected ? 1 : 0.35"
            stroke-width="0.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>

        <div
          class="see-overlay-hit"
          aria-label="Click to add trajectory point at current time"
          @click="handleCanvasClick"
        >
          <div
            v-for="trigger in allTriggers"
            :key="`keys-${trigger.index}`"
          >
            <div
              v-for="(point, index) in trigger.points"
              :key="`${trigger.index}-${point.time}-${index}`"
              class="see-overlay-keyframe"
              :class="{ selected: trigger.selected && selectedPointIndex === index, 'is-other': !trigger.selected }"
              data-keyframe="true"
              :style="{ left: `${point.x}%`, top: `${point.y}%` }"
              :title="`Trigger ${trigger.index + 1} · ${point.time.toFixed(2)}s`"
              @click.stop="selectTrigger(trigger.index)"
              @pointerdown="handlePointPointerDown($event, index, trigger.index)"
              @pointermove="handlePointPointerMove"
              @pointerup="handlePointPointerUp"
            />
          </div>
        </div>

        <button
          v-for="trigger in allTriggers"
          :key="`marker-${trigger.index}`"
          v-show="trigger.state"
          type="button"
          class="see-overlay-marker"
          :class="{ 'is-other-trigger': !trigger.selected }"
          data-trigger-marker="true"
          :aria-label="`Move trigger ${trigger.index + 1}`"
          :style="
            trigger.state
              ? {
                  left: `${trigger.state.x}%`,
                  top: `${trigger.state.y}%`,
                  width: `${hazardMarkerDiameterPercent(trigger.state.radius)}%`,
                }
              : undefined
          "
          @click.stop="selectTrigger(trigger.index)"
          @pointerdown="handleMarkerPointerDown($event, trigger.index)"
          @pointermove="handlePointPointerMove"
          @pointerup="handlePointPointerUp"
        />
      </div>
    </template>
  </div>
</template>
