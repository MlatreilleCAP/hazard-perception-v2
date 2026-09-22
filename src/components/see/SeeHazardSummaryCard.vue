<script setup lang="ts">
import { computed } from 'vue'
import densityIcon from '@/assets/see/density.png'
import maneuverIcon from '@/assets/see/maneuver.png'
import roadConditionsIcon from '@/assets/see/road-conditions.png'
import roadwayIcon from '@/assets/see/roadway.png'
import timeOfDayIcon from '@/assets/see/time-of-day.png'
import { useObserveSummaryHeadings } from '@/lib/lesson/buttonLabel'
import type { HazardClipSummary } from '@/types/see'

defineProps<{
  summary: HazardClipSummary
  cardHeight?: number | null
  progress?: number
}>()

const headings = useObserveSummaryHeadings()
const rows = computed(() => [
  { key: 'maneuver' as const, label: headings.value.maneuver, icon: maneuverIcon },
  { key: 'roadway' as const, label: headings.value.roadway, icon: roadwayIcon },
  { key: 'trafficDensity' as const, label: headings.value.trafficDensity, icon: densityIcon },
  { key: 'timeOfDay' as const, label: headings.value.timeOfDay, icon: timeOfDayIcon },
  { key: 'roadConditions' as const, label: headings.value.roadConditions, icon: roadConditionsIcon },
])
</script>

<template>
  <div
    class="see-hazard-summary-card"
    role="dialog"
    aria-label="Hazard summary"
    :style="cardHeight ? { height: `${cardHeight}px` } : undefined"
  >
    <div
      class="see-hazard-summary-progress"
      role="progressbar"
      aria-label="Intro audio remaining"
      :aria-valuenow="Math.round((progress ?? 1) * 100)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span
        class="see-hazard-summary-progress-fill"
        :style="{ transform: `scaleX(${Math.max(0, Math.min(1, progress ?? 1))})` }"
      />
    </div>
    <div class="see-hazard-summary-card-body">
      <div
        v-for="row in rows"
        :key="row.key"
        class="see-hazard-summary-row"
      >
        <div class="see-hazard-summary-icon">
          <img :src="row.icon" alt="" width="42" height="42" />
        </div>
        <div class="see-hazard-summary-copy">
          <p class="see-hazard-summary-label">{{ row.label }}</p>
          <p class="see-hazard-summary-value">{{ summary[row.key].trim() || '—' }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
