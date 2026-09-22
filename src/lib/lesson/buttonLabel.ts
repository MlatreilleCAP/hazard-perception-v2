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
