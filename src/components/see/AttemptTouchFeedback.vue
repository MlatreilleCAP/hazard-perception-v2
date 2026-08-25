<script setup lang="ts">
import { computed } from 'vue'
import {
  attemptSlotStates,
  MAX_HAZARD_ATTEMPTS,
  type AttemptSlotState,
} from '@/lib/hazards/attempts'

const props = withDefaults(
  defineProps<{
    attempts: number
    hit: boolean
    maxAttempts?: number
  }>(),
  { maxAttempts: MAX_HAZARD_ATTEMPTS },
)

/** Figma Touch Interaction frame (node 102:3849). */
const DESIGN_SIZE = 176.354
const DISPLAY_SIZE = 120
const RING_STROKE = 60
const BADGE_SIZE = 40
const RING_CENTER = DESIGN_SIZE / 2
const RING_MID_RADIUS = (DESIGN_SIZE - RING_STROKE) / 2
const BADGE_HALF = BADGE_SIZE / 2
const BADGE_ANGLES_DEG = [-145, -90, -35] as const

const SLOT_COLORS: Record<AttemptSlotState, string> = {
  hit: '#59c4b6',
  miss: '#FB5CA1',
  remaining: '#c3c1c1',
}

const scale = DISPLAY_SIZE / DESIGN_SIZE
const badgeSize = BADGE_SIZE * scale

const badgeSlots = BADGE_ANGLES_DEG.map((deg) => {
  const rad = (deg * Math.PI) / 180
  return {
    left: RING_CENTER + RING_MID_RADIUS * Math.cos(rad) - BADGE_HALF,
    top: RING_CENTER + RING_MID_RADIUS * Math.sin(rad) - BADGE_HALF,
  }
})

const slots = computed(() =>
  attemptSlotStates(props.attempts, props.hit, props.maxAttempts),
)

const label = computed(() =>
  props.hit
    ? `Found in ${props.attempts} ${props.attempts === 1 ? 'attempt' : 'attempts'}`
    : `${props.attempts} of ${props.maxAttempts} attempts used`,
)
</script>

<template>
  <div
    class="attempt-touch-feedback learner-card-pop"
    :style="{ width: `${DISPLAY_SIZE}px`, height: `${DISPLAY_SIZE}px` }"
    role="img"
    :aria-label="label"
  >
    <svg
      class="attempt-touch-ring"
      :viewBox="`0 0 ${DESIGN_SIZE} ${DESIGN_SIZE}`"
      aria-hidden="true"
    >
      <circle
        :cx="DESIGN_SIZE / 2"
        :cy="DESIGN_SIZE / 2"
        :r="(DESIGN_SIZE - RING_STROKE) / 2"
        fill="none"
        stroke="white"
        stroke-opacity="0.9"
        :stroke-width="RING_STROKE"
      />
    </svg>
    <div
      v-for="(state, index) in slots"
      :key="index"
      class="attempt-touch-badge"
      :style="{
        left: `${badgeSlots[index]!.left * scale}px`,
        top: `${badgeSlots[index]!.top * scale}px`,
        width: `${badgeSize}px`,
        height: `${badgeSize}px`,
        backgroundColor: SLOT_COLORS[state],
      }"
      aria-hidden="true"
    >
      <svg v-if="state === 'hit'" viewBox="0 0 12 12">
        <path
          d="M2.5 6.2 4.8 8.5 9.5 3.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <svg v-else viewBox="0 0 12 12">
        <path
          d="M3.2 3.2 8.8 8.8M8.8 3.2 3.2 8.8"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
    </div>
  </div>
</template>
