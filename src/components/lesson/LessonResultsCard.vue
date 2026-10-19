<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  lessonResultsQuestionLabel,
  useLessonButtonLabel,
  useLessonChallengeFailedLabel,
  useLessonChallengePassedLabel,
  useLessonResultsLabels,
} from '@/lib/lesson/buttonLabel'
import { resultsChromeLabel, useResultsChrome } from '@/lib/lesson/resultsChrome'
import LessonAccuracyIcon from '@/components/lesson/LessonAccuracyIcon.vue'
import LessonMetricRing from '@/components/lesson/LessonMetricRing.vue'
import metricCoachingIdleIcon from '@/assets/lesson/metric-coaching-idle.svg'
import metricFailIcon from '@/assets/lesson/metric-fail.svg'
import metricPassIcon from '@/assets/lesson/metric-pass.svg'
import backIcon from '@/assets/lesson/results/back.svg'
import clockIcon from '@/assets/lesson/results/clock.svg'
import fireIcon from '@/assets/lesson/results/fire.svg'
import lightningIcon from '@/assets/lesson/results/lightning.svg'
import starIcon from '@/assets/lesson/results/star.svg'
import ticketIcon from '@/assets/lesson/results/ticket.svg'
import trendDownIcon from '@/assets/lesson/results/trend-down.svg'
import trendUpIcon from '@/assets/lesson/results/trend-up.svg'
import trophyIcon from '@/assets/lesson/results/trophy.svg'
import trophyCompanyIcon from '@/assets/lesson/results/trophy-company.svg'
import {
  LESSON_PASS_PERCENT,
  type LessonMetricToken,
  type LessonResultsSection,
} from '@/types/lesson'

const props = defineProps<{
  title: string
  percent: number
  passed: boolean
  sections: LessonResultsSection[]
  /** Optional percent delta vs prior attempt; omit/null hides the chip. */
  percentDelta?: number | null
}>()

const lessonButtonLabel = useLessonButtonLabel()
const challengePassedLabel = useLessonChallengePassedLabel()
const challengeFailedLabel = useLessonChallengeFailedLabel()
const resultsLabels = useLessonResultsLabels()
const resultsChrome = useResultsChrome()

defineEmits<{
  continue: []
}>()

type ResultsStep = 'session' | 'progress'

const step = ref<ResultsStep>('session')
const visible = ref(false)

const SCORE_MULTIPLIER = 1.2
const COMPLETION_BONUS = 5
const PERFECT_RUN_BONUS = 10
const STREAK_BONUS = 10

/** Placeholder Progress numbers until gamification backend is wired. */
const progressNumbers = {
  competencies: [
    { key: 'speedManagement', fallback: 'Speed Management', percent: 85, delta: 5 },
    { key: 'spaceManagement', fallback: 'Space Management', percent: 85, delta: 5 },
    { key: 'dangerZones', fallback: 'Danger Zones', percent: 85, delta: 5 },
    { key: 'otherMotorists', fallback: 'Other Motorists', percent: 85, delta: 5 },
    { key: 'scanning', fallback: 'Scanning', percent: 85, delta: 5 },
    { key: 'attitude', fallback: 'Attitude', percent: 85, delta: 5 },
  ],
  ranks: [
    {
      id: 'department',
      key: 'departmentRank',
      fallback: 'Department Rank',
      icon: trophyIcon,
      value: '23/34',
      delta: 5,
      deltaUp: true,
    },
    {
      id: 'company',
      key: 'companyRank',
      fallback: 'Company Rank',
      icon: trophyCompanyIcon,
      value: '230/340',
      delta: 5,
      deltaUp: false,
    },
    {
      id: 'draw',
      key: 'drawEntries',
      fallback: 'Draw Entries',
      icon: ticketIcon,
      value: '1,900',
      delta: 500,
      deltaUp: true,
    },
  ],
  drawFill: 0.72,
  lifetimePoints: '1,240',
} as const

const progressCompetencies = computed(() =>
  progressNumbers.competencies.map((item) => ({
    ...item,
    label: resultsChromeLabel(resultsChrome.value[item.key], item.fallback),
  })),
)

const progressRanks = computed(() =>
  progressNumbers.ranks.map((item) => ({
    ...item,
    label: resultsChromeLabel(resultsChrome.value[item.key], item.fallback),
  })),
)

onMounted(() => {
  requestAnimationFrame(() => {
    visible.value = true
  })
})

watch(step, () => {
  visible.value = false
  requestAnimationFrame(() => {
    visible.value = true
  })
})

const baseScore = computed(() =>
  props.sections.reduce((sum, section) => sum + section.points, 0),
)

const perfectRunBonus = computed(() => {
  if (props.sections.length === 0) return 0
  return props.sections.every((section) => section.fill >= 0.999) ? PERFECT_RUN_BONUS : 0
})

const totalScore = computed(
  () =>
    Math.round(baseScore.value * SCORE_MULTIPLIER) +
    COMPLETION_BONUS +
    perfectRunBonus.value +
    STREAK_BONUS,
)

const scoreRows = computed(() => [
  {
    id: 'base',
    label: resultsChromeLabel(resultsChrome.value.scoreBase, `${props.title} Score`),
    value: String(baseScore.value),
  },
  {
    id: 'multiplier',
    label: resultsChromeLabel(resultsChrome.value.multiplier, 'Multiplier'),
    value: `x ${SCORE_MULTIPLIER}`,
  },
  {
    id: 'completion',
    label: resultsChromeLabel(resultsChrome.value.completion, 'Completion'),
    value: String(COMPLETION_BONUS),
    badge: `+${COMPLETION_BONUS}`,
  },
  {
    id: 'perfect',
    label: resultsChromeLabel(resultsChrome.value.perfectRun, 'Perfect Run'),
    value: String(perfectRunBonus.value),
    badge: perfectRunBonus.value > 0 ? `+${perfectRunBonus.value}` : undefined,
  },
  {
    id: 'streak',
    label: resultsChromeLabel(resultsChrome.value.streak, 'Streak'),
    value: String(STREAK_BONUS),
  },
  {
    id: 'total',
    label: resultsChromeLabel(resultsChrome.value.total, 'TOTAL'),
    value: String(totalScore.value),
    emphasize: true,
  },
])

const showPercentDelta = computed(
  () => typeof props.percentDelta === 'number' && Number.isFinite(props.percentDelta),
)

const percentDeltaUp = computed(() => (props.percentDelta ?? 0) > 0)
const percentDeltaDown = computed(() => (props.percentDelta ?? 0) < 0)
const percentDeltaAbs = computed(() => Math.abs(Math.round(props.percentDelta ?? 0)))

function metricIcon(metric: LessonMetricToken): string {
  if (metric.id === 'coaching') {
    return metric.status === 'idle' ? metricCoachingIdleIcon : metricFailIcon
  }
  return metric.status === 'pass' ? metricPassIcon : metricFailIcon
}

function metricAlt(metric: LessonMetricToken): string {
  if (metric.id === 'coaching') {
    return metric.status === 'idle' ? 'No coaching needed' : 'Coaching required'
  }
  if (metric.status === 'pass') return 'Correct'
  if (metric.status === 'fail') return 'Incorrect'
  return 'Partial'
}

function isAccuracyMetric(metric: LessonMetricToken): boolean {
  return metric.id === 'accuracy' && typeof metric.accuracySegments === 'number'
}

function sectionTitle(section: LessonResultsSection): string {
  if (section.id === 'see') return resultsLabels.value.observe
  if (section.id === 'know') return resultsLabels.value.process
  return resultsLabels.value.anticipate
}

function displayedMetricLabel(metric: LessonMetricToken): string {
  if (metric.id === 'detection') return resultsLabels.value.detection
  if (metric.id === 'accuracy') return resultsLabels.value.accuracy
  if (metric.id === 'coaching') return resultsLabels.value.coaching
  const question = /^Q(\d+)$/.exec(metric.label.trim())
  if (question) return lessonResultsQuestionLabel(resultsLabels.value, Number(question[1]) - 1)
  return metric.label
}

function sectionDelay(index: number): string {
  return `${180 + index * 120}ms`
}

function metricDelay(sectionIndex: number, metricIndex: number): string {
  return `${320 + sectionIndex * 120 + metricIndex * 70}ms`
}

function goToProgress(): void {
  step.value = 'progress'
}

function goToSession(): void {
  step.value = 'session'
}
</script>

<template>
  <div
    class="process-results-page lesson-results-page"
    :class="{ 'is-visible': visible, 'is-progress': step === 'progress' }"
    role="main"
    :aria-label="step === 'session' ? 'Challenge results' : 'Progress'"
  >
    <template v-if="step === 'session'">
      <div class="lesson-results-card">
        <header class="lesson-results-hero">
          <div class="lesson-results-hero-copy">
            <p class="lesson-results-title">{{ resultsChromeLabel(resultsChrome.resultsTitle, title) }}</p>
            <div class="lesson-results-status-block">
              <p class="process-results-announcement is-emphasis lesson-results-status">
                {{ passed ? challengePassedLabel : challengeFailedLabel }}
              </p>
              <p class="lesson-results-passmark">
                {{ resultsChromeLabel(resultsChrome.passMark, `Pass mark ${LESSON_PASS_PERCENT}%`) }}
              </p>
            </div>
          </div>
          <div class="lesson-results-score-cluster">
            <p class="lesson-results-percent">{{ percent }}%</p>
            <div
              v-if="showPercentDelta"
              class="lesson-results-delta"
              :class="{
                'is-up': percentDeltaUp,
                'is-down': percentDeltaDown,
              }"
            >
              <img
                v-if="percentDeltaUp || percentDeltaDown"
                class="lesson-results-delta-icon"
                :class="{ 'is-down': percentDeltaDown }"
                :src="percentDeltaDown ? trendDownIcon : trendUpIcon"
                alt=""
                width="7"
                height="7"
              />
              <span>{{ percentDeltaAbs }}%</span>
            </div>
          </div>
        </header>

        <ul v-if="sections.length > 0" class="lesson-results-sections">
          <li
            v-for="(section, sectionIndex) in sections"
            :key="section.id"
            class="lesson-results-section"
            :style="{ animationDelay: sectionDelay(sectionIndex) }"
          >
            <div class="lesson-results-section-head">
              <p class="lesson-results-section-title">{{ sectionTitle(section) }}</p>
              <p class="lesson-results-section-pts">{{ section.points }} {{ resultsLabels.pts }}</p>
            </div>
            <div class="lesson-results-bar" aria-hidden="true">
              <span
                class="lesson-results-bar-fill"
                :class="`is-${section.tone}`"
                :style="{
                  width: visible ? `${Math.round(section.fill * 100)}%` : '0%',
                  transitionDelay: sectionDelay(sectionIndex),
                }"
              />
            </div>
            <ul v-if="section.metrics.length > 0" class="lesson-results-metrics">
              <li
                v-for="(metric, metricIndex) in section.metrics"
                :key="metric.id"
                class="lesson-results-metric"
                :style="{ animationDelay: metricDelay(sectionIndex, metricIndex) }"
              >
                <template v-if="isAccuracyMetric(metric)">
                  <img
                    v-if="(metric.accuracySegments ?? 0) <= 0"
                    class="lesson-results-metric-icon"
                    :src="metricFailIcon"
                    alt="Incorrect"
                    width="20"
                    height="20"
                  />
                  <LessonAccuracyIcon
                    v-else
                    :filled="metric.accuracySegments ?? 0"
                    :animate="visible"
                    :aria-label="metricAlt(metric)"
                  />
                </template>
                <LessonMetricRing
                  v-else-if="metric.status === 'partial'"
                  :fill="metric.fill ?? 0.5"
                  :animate="visible"
                  :aria-label="metricAlt(metric)"
                />
                <img
                  v-else
                  class="lesson-results-metric-icon"
                  :src="metricIcon(metric)"
                  :alt="metricAlt(metric)"
                  width="20"
                  height="20"
                />
                <p
                  class="lesson-results-metric-label"
                  :class="{ 'is-idle': metric.status === 'idle' }"
                >
                  {{ displayedMetricLabel(metric) }}
                </p>
              </li>
            </ul>
          </li>
        </ul>
        <p v-else class="process-results-empty">Continue when you are ready.</p>

        <ul class="lesson-results-scoreboard" aria-label="Score breakdown">
          <li
            v-for="row in scoreRows"
            :key="row.id"
            class="lesson-results-score-row"
            :class="{ 'is-total': row.emphasize }"
          >
            <div class="lesson-results-score-label">
              <span>{{ row.label }}</span>
              <span v-if="row.badge" class="lesson-results-score-badge">{{ row.badge }}</span>
            </div>
            <span class="lesson-results-score-value">{{ row.value }}</span>
          </li>
        </ul>
      </div>

      <button type="button" class="process-instruction-begin" @click="goToProgress">
        {{ resultsChromeLabel(resultsChrome.continueLabel, lessonButtonLabel) }}
      </button>
    </template>

    <template v-else>
      <div class="lesson-results-card lesson-results-progress">
        <header class="lesson-results-progress-hero">
          <button
            type="button"
            class="lesson-results-back"
            aria-label="Back to session results"
            @click="goToSession"
          >
            <img :src="backIcon" alt="" width="22" height="22" />
          </button>
          <p class="process-results-announcement is-emphasis lesson-results-status">
            {{ resultsChromeLabel(resultsChrome.progress, 'Progress') }}
          </p>
        </header>

        <section class="lesson-results-progress-block" aria-label="Core competency scores">
          <h2 class="lesson-results-progress-heading">
            {{ resultsChromeLabel(resultsChrome.competencyHeading, 'Core Competency Scores to Date') }}
          </h2>
          <ul class="lesson-results-competency-list">
            <li
              v-for="item in progressCompetencies"
              :key="item.key"
              class="lesson-results-competency-row"
            >
              <span class="lesson-results-competency-label">{{ item.label }}</span>
              <div class="lesson-results-competency-values">
                <span class="lesson-results-competency-percent">{{ item.percent }}%</span>
                <div class="lesson-results-delta is-up">
                  <img
                    class="lesson-results-delta-icon"
                    :src="trendUpIcon"
                    alt=""
                    width="7"
                    height="7"
                  />
                  <span>{{ item.delta }}%</span>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <ul class="lesson-results-rank-grid" aria-label="Ranks and draw entries">
          <li
            v-for="rank in progressRanks"
            :key="rank.id"
            class="lesson-results-rank-card"
          >
            <img class="lesson-results-rank-icon" :src="rank.icon" alt="" width="20" height="20" />
            <div class="lesson-results-rank-values">
              <p class="lesson-results-rank-value">{{ rank.value }}</p>
              <div
                class="lesson-results-delta"
                :class="{ 'is-up': rank.deltaUp, 'is-down': !rank.deltaUp }"
              >
                <img
                  class="lesson-results-delta-icon"
                  :class="{ 'is-down': !rank.deltaUp }"
                  :src="rank.deltaUp ? trendUpIcon : trendDownIcon"
                  alt=""
                  width="7"
                  height="7"
                />
                <span>{{ rank.delta }}</span>
              </div>
            </div>
            <p class="lesson-results-rank-label">{{ rank.label }}</p>
          </li>
        </ul>

        <section class="lesson-results-draw" aria-label="Monthly draw">
          <div class="lesson-results-draw-head">
            <p class="lesson-results-draw-title">
              {{ resultsChromeLabel(resultsChrome.drawTitle, 'October Draw') }}
            </p>
            <p class="lesson-results-draw-remaining">
              {{ resultsChromeLabel(resultsChrome.drawRemaining, '14 days remain') }}
            </p>
          </div>
          <div class="lesson-results-bar" aria-hidden="true">
            <span
              class="lesson-results-bar-fill"
              :style="{
                width: visible ? `${Math.round(progressNumbers.drawFill * 100)}%` : '0%',
              }"
            />
          </div>
        </section>

        <section class="lesson-results-period" aria-label="This period">
          <div class="lesson-results-period-head">
            <h2 class="lesson-results-progress-heading">
              {{ resultsChromeLabel(resultsChrome.periodHeading, 'This Period') }}
            </h2>
            <span class="lesson-results-phase-pill">
              {{ resultsChromeLabel(resultsChrome.phase, 'PHASE 2') }}
            </span>
          </div>
          <ul class="lesson-results-period-list">
            <li class="lesson-results-period-row">
              <img :src="fireIcon" alt="" width="16" height="16" />
              <span>{{ resultsChromeLabel(resultsChrome.streakRow, 'Streak') }}</span>
              <strong>{{ resultsChromeLabel(resultsChrome.streakValue, 'Level 2 +10 pts') }}</strong>
            </li>
            <li class="lesson-results-period-row">
              <img :src="starIcon" alt="" width="16" height="16" />
              <span>{{ resultsChromeLabel(resultsChrome.perfectRunsRow, 'Perfect Runs') }}</span>
              <strong>{{ resultsChromeLabel(resultsChrome.perfectRunsValue, '2 this period') }}</strong>
            </li>
            <li class="lesson-results-period-row">
              <img :src="lightningIcon" alt="" width="16" height="16" />
              <span>{{ resultsChromeLabel(resultsChrome.engagementRow, 'Engagement Window') }}</span>
              <strong class="is-accent">
                {{ resultsChromeLabel(resultsChrome.engagementValue, 'Active x 1.2') }}
              </strong>
            </li>
            <li class="lesson-results-period-row">
              <img :src="clockIcon" alt="" width="16" height="16" />
              <span>{{ resultsChromeLabel(resultsChrome.lifetimePointsRow, 'Lifetime Points') }}</span>
              <strong>{{ progressNumbers.lifetimePoints }}</strong>
            </li>
          </ul>
        </section>

        <section class="lesson-results-up-next" aria-label="Up next">
          <h2 class="lesson-results-progress-heading">Up next</h2>
          <ul class="lesson-results-period-list">
            <li class="lesson-results-period-row is-plain">
              <span>Following Distance</span>
              <span class="lesson-results-phase-pill">30 Days</span>
            </li>
          </ul>
        </section>
      </div>

      <button type="button" class="process-instruction-begin" @click="$emit('continue')">
        {{ resultsChromeLabel(resultsChrome.completeSession, 'Complete Session') }}
      </button>
    </template>
  </div>
</template>
