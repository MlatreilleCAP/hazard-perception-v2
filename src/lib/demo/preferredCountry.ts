import { canonicalizeLessonCountry } from '@/lib/inroadsMvp/packageSpec'

export const DEFAULT_DEMO_COUNTRY = 'United States'

export function startingDemoCountry(input: {
  preferred: string
  published: readonly string[]
  current: string
  touched: boolean
}): string {
  const published = input.published
  if (input.touched && published.includes(input.current)) return input.current
  const preferred = canonicalizeLessonCountry(input.preferred)
  if (!input.touched && preferred && published.includes(preferred)) return preferred
  if (published.includes(input.current)) return input.current
  if (published.includes(DEFAULT_DEMO_COUNTRY)) return DEFAULT_DEMO_COUNTRY
  return published[0] ?? input.current
}
