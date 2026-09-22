<script setup lang="ts">
import { useLessonButtonLabel } from '@/lib/lesson/buttonLabel'

defineProps<{
  title: string
  description: string
  coverSrc: string
}>()

defineEmits<{
  start: []
}>()

const lessonButtonLabel = useLessonButtonLabel()
</script>

<template>
  <div class="lesson-title-page">
    <article class="activity-card lesson-title-card">
      <div class="activity-card-cover">
        <img :src="coverSrc" alt="" />
      </div>
      <div class="activity-card-body">
        <div class="activity-card-meta">
          <span class="activity-type">Activity</span>
          <span class="activity-duration">Flexible</span>
        </div>
        <div class="activity-card-copy">
          <h3>{{ title }}</h3>
          <p v-if="description.trim()">{{ description }}</p>
        </div>
        <div class="activity-card-action">
          <button type="button" class="demo-primary-button" @click="$emit('start')">
            {{ lessonButtonLabel }}
          </button>
        </div>
      </div>
    </article>
  </div>
</template>
