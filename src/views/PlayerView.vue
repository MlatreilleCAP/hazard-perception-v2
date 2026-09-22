<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { cloneJson } from '@/app/clone'
import { services } from '@/app/container'
import { expandInroadsMvpForPlayback, expandIntroductionForPlayback } from '@/activities/expandInroadsMvp'
import { findInroadsMvpNode, readInroadsMvpDefinition } from '@/activities/inroadsMvpDefinition'
import {
  provideLessonButtonLabel,
  provideLessonChallengeLabels,
  provideLessonSubmitLabel,
} from '@/lib/lesson/buttonLabel'
import { findInroadsMvpParent } from '@/services/publishInroadsMvp'
import AnticipateExperience from '@/components/anticipate/AnticipateExperience.vue'
import LessonExperience from '@/components/lesson/LessonExperience.vue'
import ProcessExperience from '@/components/process/ProcessExperience.vue'
import SeeExperience from '@/components/see/SeeExperience.vue'
import { useActivityStore } from '@/stores/activityStore'
import { useRuntimeStore } from '@/stores/runtimeStore'
import type { ActivityDefinition } from '@/types/activity'
import { isAnticipateActivity } from '@/types/anticipate'
import { isInroadsMvpActivity, isInroadsMvpChildActivity } from '@/types/inroadsMvp'
import { isIntroductionActivity } from '@/types/introduction'
import { isLessonActivity } from '@/types/lesson'
import { isProcessActivity } from '@/types/process'
import { isSeeActivity } from '@/types/see'
import { loadInroadsScoring } from '@/services/inroadsScoring'

const route = useRoute()
const router = useRouter()
const activities = useActivityStore()
const runtime = useRuntimeStore()
const definition = ref<ActivityDefinition | null>(null)
const loading = ref(typeof route.query.activity === 'string')
const replayNonce = ref(0)

const published = computed(() =>
  activities.summaries.filter(
    (summary) =>
      summary.published &&
      !isInroadsMvpChildActivity(summary.tags) &&
      !isIntroductionActivity(summary.tags),
  ),
)
const isProcess = computed(
  () => Boolean(definition.value && isProcessActivity(definition.value.metadata.tags)),
)
const isSee = computed(
  () => Boolean(definition.value && isSeeActivity(definition.value.metadata.tags)),
)
const isLesson = computed(
  () =>
    Boolean(
      definition.value &&
        (isLessonActivity(definition.value.metadata.tags) ||
          isInroadsMvpActivity(definition.value.metadata.tags)),
    ),
)
const isAnticipate = computed(
  () =>
    Boolean(definition.value && isAnticipateActivity(definition.value.metadata.tags)),
)
const hasExperience = computed(
  () => isProcess.value || isSee.value || isLesson.value || isAnticipate.value,
)

const activityId = computed(() =>
  typeof route.query.activity === 'string' ? route.query.activity : null,
)
const isPreview = computed(() => route.query.preview === '1')
const lessonButtonLabel = ref('')
const lessonSubmitLabel = ref('')
const lessonCountry = ref('')
const lessonChallengePassedLabel = ref('')
const lessonChallengeFailedLabel = ref('')
provideLessonButtonLabel(lessonButtonLabel)
provideLessonSubmitLabel(lessonSubmitLabel)
provideLessonChallengeLabels(lessonChallengePassedLabel, lessonChallengeFailedLabel)

async function resolveLessonLabels(activity: ActivityDefinition): Promise<{
  button: string
  submit: string
  country: string
  challengePassed: string
  challengeFailed: string
}> {
  const fromDefinition = (definition: ActivityDefinition | null | undefined) => {
    const mvp = definition ? readInroadsMvpDefinition(definition) : null
    return {
      button: mvp?.buttonLabel.trim() ?? '',
      submit: mvp?.submitLabel.trim() ?? '',
      country: mvp?.country.trim() ?? '',
      challengePassed: mvp?.challengePassedLabel.trim() ?? '',
      challengeFailed: mvp?.challengeFailedLabel.trim() ?? '',
    }
  }
  const empty = {
    button: '',
    submit: '',
    country: '',
    challengePassed: '',
    challengeFailed: '',
  }
  if (isInroadsMvpActivity(activity.metadata.tags)) return fromDefinition(activity)
  if (!isInroadsMvpChildActivity(activity.metadata.tags)) return empty
  const match = await findInroadsMvpParent(activity.id)
  if (!match) return empty
  const parent = isPreview.value
    ? await services.persistence.getById(match.parentId)
    : await services.persistence.getPublished(match.parentId)
  return fromDefinition(parent)
}

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
    const next = cloneJson(loaded)
    const labels = await resolveLessonLabels(next)
    lessonButtonLabel.value = labels.button
    lessonSubmitLabel.value = labels.submit
    lessonCountry.value = labels.country
    lessonChallengePassedLabel.value = labels.challengePassed
    lessonChallengeFailedLabel.value = labels.challengeFailed
    if (isIntroductionActivity(next.metadata.tags)) {
      const expanded = expandIntroductionForPlayback(next)
      if (!expanded) {
        definition.value = null
        runtime.setError('Stand Alone Video is missing its video node')
        return
      }
      definition.value = expanded
    } else if (isInroadsMvpActivity(next.metadata.tags) && findInroadsMvpNode(next)) {
      const expanded = await expandInroadsMvpForPlayback(next, {
        preview: isPreview.value,
      })
      if (!expanded) {
        definition.value = null
        runtime.setError('Inroads MVP is missing required sections')
        return
      }
      definition.value = expanded
    } else {
      definition.value = next
    }
    runtime.playDefinition(cloneJson(definition.value))
  } catch (cause) {
    definition.value = null
    runtime.setError(cause instanceof Error ? cause.message : 'Failed to start activity')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadInroadsScoring()
  await activities.refreshList('catalog')
  if (activityId.value) {
    await loadActivity(activityId.value)
  }
})

watch([activityId, isPreview], ([id]) => {
  replayNonce.value = 0
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

function mvpPreviewReturn(): { path: string; query?: { section: string } } | null {
  const mvp = route.query.mvp
  if (typeof mvp !== 'string' || !mvp) return null
  const parentId = mvp === '1' ? activityId.value : mvp
  if (!parentId) return null
  const section = route.query.section
  if (route.query.intro === '1' || section === 'intro') {
    return { path: `/studio/stand-alone-video/${parentId}` }
  }
  const query =
    section === 'see' || section === 'process' || section === 'anticipate'
      ? { section }
      : undefined
  return { path: `/studio/inroads-mvp/${parentId}`, query }
}

function onExperienceFinished(): void {
  if (isPreview.value && activityId.value) {
    const mvpReturn = mvpPreviewReturn()
    if (mvpReturn) {
      void router.push(mvpReturn)
      return
    }
    if (route.query.intro === '1' || isIntroductionActivity(activities.current?.metadata.tags)) {
      void router.push(`/studio/stand-alone-video/${activityId.value}`)
      return
    }
    if (isLesson.value) {
      void router.push(`/studio/lesson/${activityId.value}`)
      return
    }
    if (isSee.value) {
      void router.push(`/studio/see/${activityId.value}`)
      return
    }
    if (isAnticipate.value) {
      void router.push(`/studio/anticipate/${activityId.value}`)
      return
    }
    void router.push(`/studio/process/${activityId.value}`)
    return
  }

  // Demo / published playback: start the lesson over from the title page.
  if (isLesson.value) {
    replayNonce.value += 1
  }
}
</script>

<template>
  <div class="player-page" :class="{ 'is-waiting': Boolean(activityId) && !(hasExperience && definition) }">
    <div v-if="hasExperience && definition" class="player-phone-slot">
      <div class="player-phone" aria-label="iPhone 17 Pro preview (492 × 874)">
        <LessonExperience
          v-if="isLesson"
          :key="`${definition.id}-${replayNonce}`"
          :definition="definition"
          :country="lessonCountry"
          :preview="isPreview"
          @finished="onExperienceFinished"
        />
        <SeeExperience
          v-else-if="isSee"
          :key="definition.id"
          :definition="definition"
          @finished="onExperienceFinished"
        />
        <AnticipateExperience
          v-else-if="isAnticipate"
          :key="definition.id"
          :definition="definition"
          @finished="onExperienceFinished"
        />
        <ProcessExperience
          v-else
          :key="definition.id"
          :definition="definition"
          @finished="onExperienceFinished"
        />
      </div>
    </div>

    <div
      v-else-if="activityId"
      class="player-phone-slot"
    >
      <div class="player-phone is-waiting" aria-busy="true" aria-label="Loading activity">
        <p v-if="runtime.error && !loading" class="process-player-message">{{ runtime.error }}</p>
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
        <dl v-if="runtime.session && !hasExperience" class="status-grid">
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
