<script setup lang="ts">
import { onMounted } from 'vue'
import { createEmptyActivity } from '@/activities/createEmptyActivity'
import { useActivityStore } from '@/stores/activityStore'

const activities = useActivityStore()

onMounted(async () => {
  await activities.refreshList()
  if (activities.summaries[0]) {
    await activities.load(activities.summaries[0].id)
  }
})

async function createDraft(): Promise<void> {
  await activities.save(createEmptyActivity('Untitled activity'))
}

async function publishCurrent(): Promise<void> {
  if (!activities.current) return
  await activities.publish(activities.current.id)
}
</script>

<template>
  <section class="panel">
    <h2>Authoring Studio</h2>
    <p>
      Saves write the Activity Definition JSON onto the draft
      <code>activity_versions</code> row. Publish freezes that snapshot.
    </p>
    <button type="button" class="counter" @click="createDraft">Create draft</button>
    <button
      type="button"
      class="counter"
      :disabled="!activities.current"
      @click="publishCurrent"
    >
      Publish draft
    </button>
    <p v-if="activities.error" class="error">{{ activities.error }}</p>
    <p v-if="activities.current">
      Loaded definition: {{ activities.current.metadata.title }} (v{{
        activities.current.version
      }}) · {{ activities.current.nodes.length }} nodes ·
      {{ activities.current.id }}
    </p>
    <p v-else>No activity loaded.</p>
  </section>
</template>
