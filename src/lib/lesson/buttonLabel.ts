import { computed, inject, provide, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { canonicalizeLessonLanguage } from '@/lib/inroadsMvp/packageSpec'

export const DEFAULT_LESSON_BUTTON_LABEL = 'Continue'
export const DEFAULT_LESSON_SUBMIT_LABEL = 'Submit'
export const DEFAULT_LESSON_CHALLENGE_PASSED_LABEL = 'Challenge Complete'
export const DEFAULT_LESSON_CHALLENGE_FAILED_LABEL = 'Challenge Failed'

const LESSON_BUTTON_LABEL = Symbol('lessonButtonLabel')
const LESSON_SUBMIT_LABEL = Symbol('lessonSubmitLabel')
const LESSON_CHALLENGE_PASSED_LABEL = Symbol('lessonChallengePassedLabel')
const LESSON_CHALLENGE_FAILED_LABEL = Symbol('lessonChallengeFailedLabel')
const LESSON_LANGUAGE = Symbol('lessonLanguage')
const OBSERVE_SUMMARY_HEADINGS = Symbol('observeSummaryHeadings')
const LESSON_RESULTS_LABELS = Symbol('lessonResultsLabels')

export const DEFAULT_LESSON_RESULTS_LABELS = {
  pts: 'pts',
  detection: 'Detection',
  accuracy: 'Accuracy',
  coaching: 'Coaching',
  q1: 'Q1',
  q2: 'Q2',
  q3: 'Q3',
  q4: 'Q4',
  observe: 'Observation',
  process: 'Process',
  anticipate: 'Anticipation',
} as const

export type LessonResultsLabels = {
  pts: string
  detection: string
  accuracy: string
  coaching: string
  q1: string
  q2: string
  q3: string
  q4: string
  observe: string
  process: string
  anticipate: string
}

export const DEFAULT_OBSERVE_SUMMARY_HEADINGS = {
  maneuver: 'Maneuver',
  roadway: 'Roadway',
  trafficDensity: 'Traffic Density',
  timeOfDay: 'Time of Day',
  roadConditions: 'Road Conditions',
} as const

export type ObserveSummaryHeadings = {
  maneuver: string
  roadway: string
  trafficDensity: string
  timeOfDay: string
  roadConditions: string
}

export function provideLessonButtonLabel(source: MaybeRefOrGetter<string>): void {
  const label = computed(() => toValue(source).trim() || DEFAULT_LESSON_BUTTON_LABEL)
  provide(LESSON_BUTTON_LABEL, label)
}

export function useLessonButtonLabel(): ComputedRef<string> {
  const injected = inject<ComputedRef<string> | null>(LESSON_BUTTON_LABEL, null)
  return computed(() => injected?.value.trim() || DEFAULT_LESSON_BUTTON_LABEL)
}

export function provideLessonSubmitLabel(source: MaybeRefOrGetter<string>): void {
  const label = computed(() => toValue(source).trim() || DEFAULT_LESSON_SUBMIT_LABEL)
  provide(LESSON_SUBMIT_LABEL, label)
}

export function useLessonSubmitLabel(): ComputedRef<string> {
  const injected = inject<ComputedRef<string> | null>(LESSON_SUBMIT_LABEL, null)
  return computed(() => injected?.value.trim() || DEFAULT_LESSON_SUBMIT_LABEL)
}

export function provideLessonChallengeLabels(
  passed: MaybeRefOrGetter<string>,
  failed: MaybeRefOrGetter<string>,
): void {
  const passedLabel = computed(
    () => toValue(passed).trim() || DEFAULT_LESSON_CHALLENGE_PASSED_LABEL,
  )
  const failedLabel = computed(
    () => toValue(failed).trim() || DEFAULT_LESSON_CHALLENGE_FAILED_LABEL,
  )
  provide(LESSON_CHALLENGE_PASSED_LABEL, passedLabel)
  provide(LESSON_CHALLENGE_FAILED_LABEL, failedLabel)
}

export function useLessonChallengePassedLabel(): ComputedRef<string> {
  const injected = inject<ComputedRef<string> | null>(LESSON_CHALLENGE_PASSED_LABEL, null)
  return computed(() => injected?.value.trim() || DEFAULT_LESSON_CHALLENGE_PASSED_LABEL)
}

export function useLessonChallengeFailedLabel(): ComputedRef<string> {
  const injected = inject<ComputedRef<string> | null>(LESSON_CHALLENGE_FAILED_LABEL, null)
  return computed(() => injected?.value.trim() || DEFAULT_LESSON_CHALLENGE_FAILED_LABEL)
}

export function provideLessonLanguage(source: MaybeRefOrGetter<string>): void {
  const language = computed(() => canonicalizeLessonLanguage(toValue(source)))
  provide(LESSON_LANGUAGE, language)
}

export function useLessonLanguage(): ComputedRef<string> {
  const injected = inject<ComputedRef<string> | null>(LESSON_LANGUAGE, null)
  return computed(() => canonicalizeLessonLanguage(injected?.value ?? ''))
}

/** English lessons keep the wordmark loader. Every other language uses the circle. */
export function isEnglishLessonLanguage(language: string): boolean {
  const canonical = canonicalizeLessonLanguage(language)
  return !canonical || canonical === 'English'
}

function observeSummaryHeadingsFrom(source: ObserveSummaryHeadings): ObserveSummaryHeadings {
  return {
    maneuver: source.maneuver.trim() || DEFAULT_OBSERVE_SUMMARY_HEADINGS.maneuver,
    roadway: source.roadway.trim() || DEFAULT_OBSERVE_SUMMARY_HEADINGS.roadway,
    trafficDensity: source.trafficDensity.trim() || DEFAULT_OBSERVE_SUMMARY_HEADINGS.trafficDensity,
    timeOfDay: source.timeOfDay.trim() || DEFAULT_OBSERVE_SUMMARY_HEADINGS.timeOfDay,
    roadConditions: source.roadConditions.trim() || DEFAULT_OBSERVE_SUMMARY_HEADINGS.roadConditions,
  }
}

export function provideObserveSummaryHeadings(source: MaybeRefOrGetter<ObserveSummaryHeadings>): void {
  const headings = computed(() => observeSummaryHeadingsFrom(toValue(source)))
  provide(OBSERVE_SUMMARY_HEADINGS, headings)
}

export function useObserveSummaryHeadings(): ComputedRef<ObserveSummaryHeadings> {
  const injected = inject<ComputedRef<ObserveSummaryHeadings> | null>(OBSERVE_SUMMARY_HEADINGS, null)
  return computed(() =>
    injected ? observeSummaryHeadingsFrom(injected.value) : { ...DEFAULT_OBSERVE_SUMMARY_HEADINGS },
  )
}

function lessonResultsLabelsFrom(source: LessonResultsLabels): LessonResultsLabels {
  return {
    pts: source.pts.trim() || DEFAULT_LESSON_RESULTS_LABELS.pts,
    detection: source.detection.trim() || DEFAULT_LESSON_RESULTS_LABELS.detection,
    accuracy: source.accuracy.trim() || DEFAULT_LESSON_RESULTS_LABELS.accuracy,
    coaching: source.coaching.trim() || DEFAULT_LESSON_RESULTS_LABELS.coaching,
    q1: source.q1.trim() || DEFAULT_LESSON_RESULTS_LABELS.q1,
    q2: source.q2.trim() || DEFAULT_LESSON_RESULTS_LABELS.q2,
    q3: source.q3.trim() || DEFAULT_LESSON_RESULTS_LABELS.q3,
    q4: source.q4.trim() || DEFAULT_LESSON_RESULTS_LABELS.q4,
    observe: source.observe.trim() || DEFAULT_LESSON_RESULTS_LABELS.observe,
    process: source.process.trim() || DEFAULT_LESSON_RESULTS_LABELS.process,
    anticipate: source.anticipate.trim() || DEFAULT_LESSON_RESULTS_LABELS.anticipate,
  }
}

export function provideLessonResultsLabels(source: MaybeRefOrGetter<LessonResultsLabels>): void {
  const labels = computed(() => lessonResultsLabelsFrom(toValue(source)))
  provide(LESSON_RESULTS_LABELS, labels)
}

export function useLessonResultsLabels(): ComputedRef<LessonResultsLabels> {
  const injected = inject<ComputedRef<LessonResultsLabels> | null>(LESSON_RESULTS_LABELS, null)
  return computed(() =>
    injected ? lessonResultsLabelsFrom(injected.value) : { ...DEFAULT_LESSON_RESULTS_LABELS },
  )
}

export function lessonResultsQuestionLabel(labels: LessonResultsLabels, index: number): string {
  const keyed = [labels.q1, labels.q2, labels.q3, labels.q4]
  return keyed[index] ?? `Q${index + 1}`
}
