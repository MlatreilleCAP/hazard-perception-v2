import { computed, inject, provide, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

export const RESULTS_CHROME_KEYS = [
  'resultsTitle',
  'passMark',
  'scoreBase',
  'multiplier',
  'completion',
  'perfectRun',
  'streak',
  'total',
  'continueLabel',
  'progress',
  'competencyHeading',
  'speedManagement',
  'spaceManagement',
  'dangerZones',
  'otherMotorists',
  'scanning',
  'attitude',
  'departmentRank',
  'companyRank',
  'drawEntries',
  'drawTitle',
  'drawRemaining',
  'periodHeading',
  'phase',
  'streakRow',
  'streakValue',
  'perfectRunsRow',
  'perfectRunsValue',
  'engagementRow',
  'engagementValue',
  'lifetimePointsRow',
  'completeSession',
] as const

export type ResultsChromeKey = (typeof RESULTS_CHROME_KEYS)[number]

export type ResultsChrome = Record<ResultsChromeKey, string>

export const EMPTY_RESULTS_CHROME: ResultsChrome = Object.fromEntries(
  RESULTS_CHROME_KEYS.map((key) => [key, '']),
) as ResultsChrome

const RESULTS_CHROME = Symbol('resultsChrome')

export function readResultsChrome(value: unknown): ResultsChrome {
  const raw = value && typeof value === 'object' ? (value as Partial<ResultsChrome>) : {}
  const next = { ...EMPTY_RESULTS_CHROME }
  for (const key of RESULTS_CHROME_KEYS) {
    const item = raw[key]
    next[key] = typeof item === 'string' ? item.trim() : ''
  }
  return next
}

/** Keep stored labels, and replace only the keys present in an upload. */
export function mergeResultsChrome(
  current: ResultsChrome,
  incoming: Partial<ResultsChrome>,
): ResultsChrome {
  const next = readResultsChrome(current)
  for (const key of RESULTS_CHROME_KEYS) {
    if (typeof incoming[key] === 'string') next[key] = incoming[key].trim()
  }
  return next
}

export function resultsChromeLabel(value: string, fallback: string): string {
  return value.trim() || fallback
}

export function provideResultsChrome(source: MaybeRefOrGetter<ResultsChrome>): void {
  const chrome = computed(() => readResultsChrome(toValue(source)))
  provide(RESULTS_CHROME, chrome)
}

export function useResultsChrome(): ComputedRef<ResultsChrome> {
  const injected = inject<ComputedRef<ResultsChrome> | null>(RESULTS_CHROME, null)
  return computed(() => (injected ? readResultsChrome(injected.value) : { ...EMPTY_RESULTS_CHROME }))
}
