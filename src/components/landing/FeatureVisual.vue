<script setup lang="ts">
import type { LandingFeatureVisual } from '@/app/landingFeatures'

defineProps<{
  kind: LandingFeatureVisual
}>()

const modeLabels = ['HP', 'RT', 'SC', 'CO'] as const
const scaleBars = [28, 44, 36, 58, 72, 48]

function modeOffset(index: number): string {
  const angle = (index / 4) * Math.PI * 2 - Math.PI / 2
  return `translate(${Math.cos(angle) * 52}px, ${Math.sin(angle) * 52}px)`
}
</script>

<template>
  <div v-if="kind === 'hazards'" class="feature-visual feature-visual-hazards">
    <div class="hazard-chip">Hazard Detected</div>
    <div class="hazard-card">
      <div class="hazard-card-media" />
      <div class="hazard-card-lines">
        <span class="line line-wide" />
        <span class="line line-mid" />
      </div>
    </div>
    <div class="hazard-plus" aria-hidden="true">+</div>
  </div>

  <div v-else-if="kind === 'lessons'" class="feature-visual feature-visual-lessons">
    <div
      v-for="i in 3"
      :key="i"
      class="lesson-card"
      :style="{
        transform: `translateY(${(3 - i) * -10}px) scale(${1 - (i - 1) * 0.04})`,
        zIndex: 4 - i,
        opacity: 1 - (i - 1) * 0.15,
      }"
    >
      <div class="lesson-stars">
        <span v-for="star in 5" :key="star">★</span>
      </div>
      <span class="line line-wide" />
      <span class="line line-mid" />
    </div>
  </div>

  <div v-else-if="kind === 'feedback'" class="feature-visual feature-visual-feedback">
    <div class="feedback-bell" aria-hidden="true">🔔</div>
    <div class="feedback-card">
      <p class="feedback-title">New coaching tip!</p>
      <p class="feedback-body">You spotted 3 of 4 developing hazards.</p>
    </div>
  </div>

  <div v-else-if="kind === 'insights'" class="feature-visual feature-visual-insights">
    <div class="insight-chip">1,245 sessions</div>
    <svg viewBox="0 0 200 80" class="insight-chart" aria-hidden="true">
      <path
        d="M0 60 C40 55, 50 30, 80 35 S120 55, 140 28 S180 20, 200 10"
        fill="none"
        stroke="#707591"
        stroke-width="3"
        stroke-linecap="round"
      />
      <path
        d="M0 60 C40 55, 50 30, 80 35 S120 55, 140 28 S180 20, 200 10 V80 H0 Z"
        fill="url(#insight-fill)"
        opacity="0.25"
      />
      <defs>
        <linearGradient id="insight-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stop-color="#707591" />
          <stop offset="1" stop-color="#707591" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  </div>

  <div v-else-if="kind === 'modes'" class="feature-visual feature-visual-modes">
    <div class="mode-ring mode-ring-outer" />
    <div class="mode-ring mode-ring-inner" />
    <div class="mode-core">AI</div>
    <div
      v-for="(label, index) in modeLabels"
      :key="label"
      class="mode-node"
      :style="{ transform: modeOffset(index) }"
    >
      {{ label }}
    </div>
  </div>

  <div v-else class="feature-visual feature-visual-scale">
    <div
      v-for="(height, index) in scaleBars"
      :key="index"
      class="scale-bar"
      :class="{ 'scale-bar-accent': index === 4 }"
      :style="{ height: `${height}%` }"
    />
    <div class="scale-chip">100+</div>
  </div>
</template>
