<script setup lang="ts">
import { onMounted } from 'vue'
import { createEmptyActivity } from '@/activities/createEmptyActivity'
import { useActivityStore } from '@/stores/activityStore'
import { useAppStore } from '@/stores/appStore'
import { useRuntimeStore } from '@/stores/runtimeStore'

const app = useAppStore()
const activities = useActivityStore()
const runtime = useRuntimeStore()

onMounted(async () => {
  await activities.refreshList()
})

function runEngineSmoke(): void {
  runtime.playDefinition(createEmptyActivity('Engine smoke activity'))
}
</script>

<template>
  <section class="panel">
    <h2>Architecture status</h2>
    <p>
      Activity persistence uses the v2 <code>activities</code> and
      <code>activity_versions</code> tables. The engine smoke test still runs a
      local definition and does not write to the database.
    </p>

    <dl class="status-grid">
      <div>
        <dt>Vue shell</dt>
        <dd>ready</dd>
      </div>
      <div>
        <dt>Vue Router</dt>
        <dd>{{ $route.name }}</dd>
      </div>
      <div>
        <dt>Pinia</dt>
        <dd>booted {{ app.bootedAt }}</dd>
      </div>
      <div>
        <dt>Supabase configured</dt>
        <dd>{{ app.supabase.configured ? 'yes' : 'no' }}</dd>
      </div>
      <div>
        <dt>Supabase client</dt>
        <dd>{{ app.supabase.initialized ? 'initialized' : 'not initialized' }}</dd>
      </div>
      <div>
        <dt>Production queries</dt>
        <dd>{{ app.supabase.queriedProduction ? 'yes' : 'none' }}</dd>
      </div>
      <div>
        <dt>Persistence</dt>
        <dd>{{ app.persistenceMode }}</dd>
      </div>
      <div>
        <dt>Activities listed</dt>
        <dd>{{ activities.summaries.length }}</dd>
      </div>
      <div>
        <dt>Node plugins</dt>
        <dd>{{ app.nodePlugins.map((plugin) => plugin.type).join(', ') }}</dd>
      </div>
    </dl>

    <p v-if="activities.error" class="error">{{ activities.error }}</p>

    <h3>Engine smoke test</h3>
    <p>Runs start → end in memory. Does not create an attempt or activity row.</p>
    <button type="button" class="counter" @click="runEngineSmoke">Run engine smoke</button>
    <p v-if="runtime.error" class="error">{{ runtime.error }}</p>
    <p v-if="runtime.session">
      Session {{ runtime.session.status }} · node
      {{ runtime.session.currentNodeId }} · events
      {{ runtime.session.eventLog.length }}
    </p>
  </section>
</template>
