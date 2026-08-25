<script setup lang="ts">
import checkIcon from '@/assets/process-result-check.svg'
import incorrectIcon from '@/assets/process-result-incorrect.svg'

defineProps<{
  points: number
  passed: boolean
  results: Array<{ id: string; label: string; text: string; correct: boolean }>
}>()

defineEmits<{
  continue: []
}>()
</script>

<template>
  <div class="process-results-page" role="main" aria-label="Process results">
    <section class="process-results-score-card">
      <div class="process-results-trophy" aria-hidden="true" />
      <div class="process-results-announcement">
        <p class="process-results-points">You received +{{ points }} Points</p>
        <p class="process-results-status">
          {{
            passed
              ? 'You passed process training. Keep Going!'
              : 'Additional training may be needed. Keep going!'
          }}
        </p>
      </div>
    </section>

    <ul v-if="results.length > 0" class="process-results-questions">
      <li v-for="item in results" :key="item.id" class="process-results-question">
        <p class="process-results-kicker">{{ item.label }}</p>
        <div class="process-results-question-row">
          <span class="process-results-mark-box">
            <img
              class="process-results-mark"
              :src="item.correct ? checkIcon : incorrectIcon"
              :alt="item.correct ? 'Correct' : 'Incorrect'"
              width="13"
              height="13"
            />
          </span>
          <p class="process-results-question-text">{{ item.text }}</p>
        </div>
      </li>
    </ul>
    <p v-else class="process-results-empty">Continue when you are ready.</p>

    <button type="button" class="process-instruction-begin" @click="$emit('continue')">
      Continue
    </button>
  </div>
</template>
