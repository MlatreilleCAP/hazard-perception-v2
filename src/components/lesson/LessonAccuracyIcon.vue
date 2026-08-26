<script setup lang="ts">
withDefaults(
  defineProps<{
    /** How many of the three arcs should be green (0–3). */
    filled: number
  }>(),
  { filled: 0 },
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
      :d="segment.d"
      fill="none"
      :stroke="segment.index < filled ? 'var(--process-correct, #59c4b6)' : '#c9d5d7'"
      :stroke-width="STROKE"
      stroke-linecap="butt"
    />
  </svg>
</template>
