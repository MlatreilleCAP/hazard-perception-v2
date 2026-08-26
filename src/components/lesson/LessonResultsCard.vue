<script setup lang="ts">
defineProps<{
  title: string
  percent: number
  sections: Array<{
    id: string
    title: string
    points: number
    fill: number
    summary: string
    tone: 'pass' | 'fail' | 'partial' | 'neutral'
  }>
}>()

defineEmits<{
  continue: []
}>()
</script>

<template>
  <div class="process-results-page lesson-results-page" role="main" aria-label="Lesson results">
    <p class="process-results-announcement is-emphasis">LESSON COMPLETE</p>
    <p class="lesson-results-title">{{ title }}</p>
    <p class="lesson-results-percent">{{ percent }}%</p>

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
        <p class="lesson-results-section-summary">{{ section.summary }}</p>
      </li>
    </ul>
    <p v-else class="process-results-empty">Continue when you are ready.</p>

    <button type="button" class="process-instruction-begin" @click="$emit('continue')">
      Continue
    </button>
  </div>
</template>
