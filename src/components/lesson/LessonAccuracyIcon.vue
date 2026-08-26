<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** How many of the three arcs should be green (0–3). */
    filled: number
    animate?: boolean
  }>(),
  { filled: 0, animate: false },
)

const SIZE = 27
const CX = 13.5
const CY = 13.5
/** Centerline radius so outer edge matches the 27px Time ring. */
const R = 11
const STROKE = 5
/** Gap between segments, in degrees. */
const GAP = 14
const SEGMENT = (360 - GAP * 3) / 3

function polar(angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: CX + R * Math.cos(rad),
    y: CY + R * Math.sin(rad),
  }
}

function arcPath(index: number): string {
  const start = index * (SEGMENT + GAP) + GAP / 2
  const end = start + SEGMENT
  const a = polar(start)
  const b = polar(end)
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`
}

const segments = [0, 1, 2].map((index) => ({
  index,
  d: arcPath(index),
}))

const displayedFilled = ref(0)

watch(
  [() => props.animate, () => props.filled],
  ([animate, filled]) => {
    if (!animate) {
      displayedFilled.value = filled
      return
    }
    displayedFilled.value = 0
    requestAnimationFrame(() => {
      displayedFilled.value = filled
    })
  },
  { immediate: true },
)

const segmentStroke = computed(
  () => (index: number) =>
    index < displayedFilled.value
      ? 'var(--process-correct, #60a1a7)'
      : '#c9d5d7',
)
</script>

<template>
  <svg
    class="lesson-accuracy-icon"
    :width="SIZE"
    :height="SIZE"
    :viewBox="`0 0 ${SIZE} ${SIZE}`"
    aria-hidden="true"
  >
    <path
      v-for="segment in segments"
      :key="segment.index"
      class="lesson-accuracy-icon-segment"
      :class="{ 'is-filled': segment.index < displayedFilled }"
      :d="segment.d"
      fill="none"
      :stroke="segmentStroke(segment.index)"
      :stroke-width="STROKE"
      stroke-linecap="butt"
    />
  </svg>
</template>
