<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 0–1 progress around the ring. */
    fill?: number
  }>(),
  { fill: 0.5 },
)

const SIZE = 27
const CX = 13.5
const CY = 13.5
const R = 11
const STROKE = 5
const CIRCUMFERENCE = 2 * Math.PI * R

const progress = computed(() => Math.min(1, Math.max(0, props.fill ?? 0)))
const dashOffset = computed(() => CIRCUMFERENCE * (1 - progress.value))
</script>

<template>
  <svg
    class="lesson-results-metric-ring"
    :width="SIZE"
    :height="SIZE"
    :viewBox="`0 0 ${SIZE} ${SIZE}`"
    role="img"
  >
    <circle
      :cx="CX"
      :cy="CY"
      :r="R"
      fill="none"
      stroke="#e3e5ef"
      :stroke-width="STROKE"
    />
    <circle
      :cx="CX"
      :cy="CY"
      :r="R"
      fill="none"
      stroke="var(--process-correct, #59c4b6)"
      :stroke-width="STROKE"
      :stroke-dasharray="CIRCUMFERENCE"
      :stroke-dashoffset="dashOffset"
      stroke-linecap="butt"
      :transform="`rotate(-90 ${CX} ${CY})`"
    />
  </svg>
</template>
