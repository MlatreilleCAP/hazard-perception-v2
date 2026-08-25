<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { cloneJson } from '@/app/clone'
import { services } from '@/app/container'
import ProcessExperience from '@/components/process/ProcessExperience.vue'
import { useActivityStore } from '@/stores/activityStore'
import { useRuntimeStore } from '@/stores/runtimeStore'
import type { ActivityDefinition } from '@/types/activity'
import { isProcessActivity } from '@/types/process'

const route = useRoute()
const router = useRouter()
const activities = useActivityStore()
const runtime = useRuntimeStore()
const definition = ref<ActivityDefinition | null>(null)
const loading = ref(false)

const published = computed(() =>
  activities.summaries.filter((summary) => summary.published),
)
const isProcess = computed(
  () => Boolean(definition.value && isProcessActivity(definition.value.metadata.tags)),
)

const activityId = computed(() =>
  typeof route.query.activity === 'string' ? route.query.activity : null,
)
const isPreview = computed(() => route.query.preview === '1')

async function loadActivity(id: string): Promise<void> {
  loading.value = true
  runtime.setError(null)
  try {
    const staged =
      isPreview.value && activities.preview?.id === id
        ? activities.preview
        : isPreview.value && activities.current?.id === id
          ? activities.current
          : null
    const loaded =
      staged ??
      (isPreview.value
        ? await services.persistence.getById(id)
        : await services.persistence.getPublished(id))
    if (!loaded) {
      definition.value = null
      runtime.setError(
        isPreview.value
          ? `Activity ${id} was not found`
          : `Activity ${id} has no published version`,
      )
      return
    }
    definition.value = cloneJson(loaded)
    runtime.playDefinition(definition.value)
  } catch (cause) {
    definition.value = null
    runtime.setError(cause instanceof Error ? cause.message : 'Failed to start activity')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await activities.refreshList()
  if (activityId.value) {
    await loadActivity(activityId.value)
  }
})

watch([activityId, isPreview], ([id]) => {
  if (id) void loadActivity(id)
})

async function playFirstPublished(): Promise<void> {
  const first = published.value[0]
  if (!first) {
    runtime.setError('No published activity to play')
    return
  }
  await loadActivity(first.id)
}

function onProcessFinished(): void {
  if (isPreview.value && activityId.value) {
    void router.push(`/studio/process/${activityId.value}`)
  }
}
</script>

<template>
  <div class="player-page">
    <div v-if="isProcess && definition" class="player-phone-slot">
      <div class="player-phone" aria-label="iPhone 17 Pro preview (402 × 874)">
        <ProcessExperience
          :key="definition.id"
          :definition="definition"
          @finished="onProcessFinished"
        />
      </div>
    </div>

    <section v-else class="player-fallback panel">
      <h2>Runtime Player</h2>
      <p v-if="loading">Loading activity…</p>
      <template v-else>
        <p>
          The player loads a frozen published <code>activity_version_id</code>, never
          the draft, unless you open Preview from Studio.
        </p>
        <button type="button" class="counter" @click="playFirstPublished">
          Play published activity
        </button>
        <p v-if="activities.error" class="error">{{ activities.error }}</p>
        <p v-if="runtime.error" class="error">{{ runtime.error }}</p>
        <p v-if="published.length === 0">No published activities yet.</p>
        <dl v-if="runtime.session && !isProcess" class="status-grid">
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
      </template>
    </section>
  </div>
</template>
