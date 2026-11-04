import {
  canonicalizeLessonCountry,
  canonicalizeLessonLanguage,
} from '@/lib/inroadsMvp/packageSpec'

export function lessonVersionKey(title: string): string {
  return title.trim().toLowerCase()
}

/** Demo preview card title. The activity name is not the card title once a title is set. */
export function previewCardTitle(
  lessonTitle: string | null | undefined,
  activityName: string | null | undefined,
): string {
  return lessonTitle?.trim() || activityName?.trim() || 'Activity'
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
