<script setup lang="ts">
import metricFailIcon from '@/assets/lesson/metric-fail.svg'
import metricPassIcon from '@/assets/lesson/metric-pass.svg'
import type { LessonMetricStatus, LessonResultsSection } from '@/types/lesson'

defineProps<{
  title: string
  percent: number
  passed: boolean
  summary: string
  sections: LessonResultsSection[]
}>()

defineEmits<{
  continue: []
}>()

function metricIcon(status: Exclude<LessonMetricStatus, 'partial'>): string {
  return status === 'pass' ? metricPassIcon : metricFailIcon
}

function metricAlt(status: LessonMetricStatus): string {
  if (status === 'pass') return 'Correct'
  if (status === 'fail') return 'Incorrect'
  return 'Partial'
}
</script>

<template>
  <div
    class="process-results-page lesson-results-page"
    role="main"
    aria-label="Challenge results"
  >
    <p class="process-results-announcement is-emphasis">Challenge Complete</p>

    <div class="lesson-results-card">
      <header class="lesson-results-hero">
        <div class="lesson-results-hero-copy">
          <p class="lesson-results-brand">inroads</p>
          <p class="lesson-results-title">{{ title }}</p>
        </div>
        <p class="lesson-results-percent">{{ percent }}%</p>
      </header>
      <p class="lesson-results-summary">{{ summary }}</p>

      <ul v-if="sections.length > 0" class="lesson-results-sections">
        <li v-for="section in sections" :key="section.id" class="lesson-results-section">
          <div class="lesson-results-section-head">
            <p class="lesson-results-section-title">{{ section.title }}</p>
            <p class="lesson-results-section-pts">{{ section.points }} pts</p>
          </div>
          <div class="lesson-results-bar" aria-hidden="true">
            <span
              class="lesson-results-bar-fill"
              :class="`is-${section.tone}`"
              :style="{ width: `${Math.round(section.fill * 100)}%` }"
            />
          </div>
          <ul v-if="section.metrics.length > 0" class="lesson-results-metrics">
            <li
              v-for="metric in section.metrics"
              :key="metric.id"
              class="lesson-results-metric"
            >
              <span
                v-if="metric.status === 'partial'"
                class="lesson-results-metric-ring"
                :style="{
                  background: `conic-gradient(var(--process-correct, #59c4b6) ${Math.round((metric.fill ?? 0.5) * 100)}%, #e3e5ef 0)`,
                }"
                :aria-label="metricAlt(metric.status)"
              />
              <img
                v-else
                class="lesson-results-metric-icon"
                :src="metricIcon(metric.status)"
                :alt="metricAlt(metric.status)"
                width="27"
                height="27"
              />
              <p class="lesson-results-metric-label">{{ metric.label }}</p>
            </li>
          </ul>
        </li>
      </ul>
      <p v-else class="process-results-empty">Continue when you are ready.</p>
    </div>

    <button type="button" class="process-instruction-begin" @click="$emit('continue')">
      Continue
    </button>
  </div>
</template>
