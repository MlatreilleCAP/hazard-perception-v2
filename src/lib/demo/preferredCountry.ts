import { canonicalizeLessonCountry } from '@/lib/inroadsMvp/packageSpec'

export const DEFAULT_DEMO_COUNTRY = 'United States'

/** Published lesson countries, with United States first when it is one of them. */
export function publishedDemoCountryNames(countries: readonly string[]): string[] {
  const names = new Set<string>()
  for (const value of countries) {
    const country = canonicalizeLessonCountry(value)
    if (country) names.add(country)
  }
  return [...names].sort((left, right) => {
    if (left === DEFAULT_DEMO_COUNTRY) return -1
    if (right === DEFAULT_DEMO_COUNTRY) return 1
    return left.localeCompare(right)
  })
}

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
