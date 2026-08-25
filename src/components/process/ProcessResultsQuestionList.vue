<script setup lang="ts">
import checkIcon from '@/assets/process-result-check.svg'
import incorrectIcon from '@/assets/process-result-incorrect.svg'
import type { ProcessQuestionResult } from '@/types/questions'

defineProps<{
  results: ProcessQuestionResult[]
}>()
</script>

<template>
  <ul v-if="results.length > 0" class="process-results-questions">
    <li
      v-for="(item, index) in results"
      :key="item.id"
      class="process-results-question"
      :class="{ 'has-explanation': Boolean(item.explanation) }"
      :style="{ '--process-pop-delay': `${120 + index * 90}ms` }"
    >
      <span class="process-results-mark-box">
        <img
          class="process-results-mark"
          :src="item.correct ? checkIcon : incorrectIcon"
          :alt="item.correct ? 'Correct' : 'Incorrect'"
          width="21"
          height="21"
        />
      </span>
      <div class="process-results-question-body">
        <p class="process-results-question-text">{{ item.text }}</p>
        <p v-if="item.explanation" class="process-results-question-explanation">
          {{ item.explanation }}
        </p>
      </div>
    </li>
  </ul>
  <p v-else class="process-results-empty">Continue when you are ready.</p>
</template>
