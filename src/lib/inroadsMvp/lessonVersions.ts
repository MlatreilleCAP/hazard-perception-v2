import {
  canonicalizeLessonCountry,
  canonicalizeLessonLanguage,
} from '@/lib/inroadsMvp/packageSpec'

export function lessonVersionKey(title: string): string {
  return title.trim().toLowerCase()
}

export function lessonVersionLabel(
  country: string,
  language: string,
  published = true,
): string {
  const locale = [country.trim(), language.trim()].filter(Boolean).join(' · ')
  if (!locale) {
    return 'Upload file or Enter Details Below to Configure'
  }
  return published ? locale : `${locale} · Draft`
}

export function lessonLocalesMatch(
  leftCountry: string,
  leftLanguage: string,
  rightCountry: string,
  rightLanguage: string,
): boolean {
  const country = canonicalizeLessonCountry(leftCountry)
  const language = canonicalizeLessonLanguage(leftLanguage)
  if (!country || !language) return false
  return (
    country === canonicalizeLessonCountry(rightCountry) &&
    language === canonicalizeLessonLanguage(rightLanguage)
  )
}
