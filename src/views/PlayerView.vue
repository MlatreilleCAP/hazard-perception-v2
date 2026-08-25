<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useActivityStore } from '@/stores/activityStore'
import { useRuntimeStore } from '@/stores/runtimeStore'

const route = useRoute()
const activities = useActivityStore()
const runtime = useRuntimeStore()
const published = computed(() =>
  activities.summaries.filter((summary) => summary.published),
)

onMounted(async () => {
  await activities.refreshList()
  const activityId =
    typeof route.query.activity === 'string' ? route.query.activity : null
  if (activityId) {
    await runtime.play(activityId)
  }
})

async function playFirstPublished(): Promise<void> {
  const first = published.value[0]
  if (!first) {
    runtime.setError('No published activity to play')
    return
  }
  await runtime.play(first.id)
}
</script>

<template>
  <section class="panel">
    <h2>Runtime Player</h2>
    <p>
      The player loads a frozen published <code>activity_version_id</code>, never
      the draft.
    </p>
    <button type="button" class="counter" @click="playFirstPublished">
      Play published activity
    </button>
    <p v-if="activities.error" class="error">{{ activities.error }}</p>
    <p v-if="runtime.error" class="error">{{ runtime.error }}</p>
    <p v-if="published.length === 0">No published activities yet.</p>
    <dl v-if="runtime.session" class="status-grid">
      <div>
        <dt>Status</dt>
        <dd>{{ runtime.session.status }}</dd>
      </div>
      <div>
        <dt>Adapter</dt>
        <dd>{{ runtime.session.adapter }}</dd>
      </div>
      <div>
        <dt>Activity version</dt>
        <dd>{{ runtime.session.activityVersion }}</dd>
      </div>
      <div>
        <dt>Events</dt>
        <dd>{{ runtime.session.eventLog.length }}</dd>
      </div>
    </dl>
  </section>
</template>
