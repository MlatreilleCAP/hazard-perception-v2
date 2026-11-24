import { LESSON_LANGUAGE_OPTIONS } from '@/lib/inroadsMvp/lessonLanguages'
import { lessonVersionKey } from '@/lib/inroadsMvp/lessonVersions'
import {
  basename,
  canonicalizeLessonCountry,
  canonicalizeLessonLanguage,
} from '@/lib/inroadsMvp/packageSpec'

const KNOWN_LANGUAGES = new Set<string>(LESSON_LANGUAGE_OPTIONS)

/** Activity name shared by every language of a lesson: title (C3) and country (C2). */
export function workbookLessonName(title: string, country: string): string {
  const name = title.trim()
  const place = canonicalizeLessonCountry(country)
  if (!name || !place) return ''
  return `${name} - ${place}`
}

/** Language from the last part of a file name, such as Lane Changes_Poland_Polish.xlsx. */
export function languageFromWorkbookFileName(fileName: string): string {
  const stem = basename(fileName)
    .replace(/\.xlsx?$/i, '')
    .replace(/\s*\(\d+\)$/, '')
  const segment = stem.split('_').pop()?.trim() ?? ''
  const language = canonicalizeLessonLanguage(segment)
  if (!language || !KNOWN_LANGUAGES.has(language)) return ''
  return language
}

export type WorkbookLessonFile = {
  fileName: string
  lessonName: string
  language: string
  title: string
  country: string
  description: string
  /** Landing title from the workbook, when the activity uses a different name. */
  cardTitle?: string
  sku?: string
}

export type ExistingLessonIdentity = {
  id: string
  title: string
  lessonTitle: string
  country: string
  language: string
  sku: string
  /** ISO timestamp. When two copies match, the older activity is the one to update. */
  createdAt?: string
}

function identityKeys(...values: Array<string | null | undefined>): Set<string> {
  return new Set(values.map((value) => lessonVersionKey(value ?? '')).filter(Boolean))
}

function sameCountry(left: string, right: string): boolean {
  const lessonCountry = canonicalizeLessonCountry(left)
  const existingCountry = canonicalizeLessonCountry(right)
  if (!lessonCountry || !existingCountry) return true
  return lessonCountry === existingCountry
}

/** True when this spreadsheet is another copy of a lesson already in the studio. */
export function workbookMatchesExistingLesson(
  lesson: Pick<WorkbookLessonFile, 'lessonName' | 'title' | 'country' | 'cardTitle' | 'sku'>,
  existing: Pick<ExistingLessonIdentity, 'title' | 'lessonTitle' | 'country' | 'sku'>,
): boolean {
  if (!sameCountry(lesson.country, existing.country)) return false
  const lessonSku = lesson.sku?.trim() ?? ''
  const existingSku = existing.sku.trim()
  if (lessonSku && existingSku && lessonSku !== existingSku) return false
  if (lessonSku && existingSku && lessonSku === existingSku) return true
  const lessonKeys = identityKeys(lesson.lessonName, lesson.title, lesson.cardTitle)
  const existingKeys = identityKeys(existing.title, existing.lessonTitle)
  for (const key of lessonKeys) {
    if (existingKeys.has(key)) return true
  }
  return false
}

function matchRank(
  lesson: Pick<WorkbookLessonFile, 'lessonName' | 'title' | 'cardTitle' | 'sku'>,
  existing: ExistingLessonIdentity,
): number {
  let score = 0
  const lessonSku = lesson.sku?.trim() ?? ''
  if (lessonSku && existing.sku === lessonSku) score += 4
  if (lessonVersionKey(existing.title) === lessonVersionKey(lesson.lessonName)) score += 2
  if (lesson.cardTitle && lessonVersionKey(existing.title) === lessonVersionKey(lesson.cardTitle)) {
    score += 3
  }
  if (
    lesson.cardTitle &&
    lessonVersionKey(existing.lessonTitle) === lessonVersionKey(lesson.cardTitle)
  ) {
    score += 1
  }
  return score
}

/** Language versions of the existing lesson this workbook belongs to. */
export function existingVersionsForWorkbook(
  lesson: Pick<WorkbookLessonFile, 'lessonName' | 'title' | 'country' | 'cardTitle' | 'sku'>,
  existing: readonly ExistingLessonIdentity[],
): Map<string, string> {
  const matches = existing
    .filter((item) => workbookMatchesExistingLesson(lesson, item))
    .sort((left, right) => {
      const byRank = matchRank(lesson, right) - matchRank(lesson, left)
      if (byRank !== 0) return byRank
      return (left.createdAt || '9999').localeCompare(right.createdAt || '9999')
    })
  const versions = new Map<string, string>()
  for (const item of matches) {
    const language = canonicalizeLessonLanguage(item.language) || 'English'
    if (!versions.has(language)) versions.set(language, item.id)
  }
  return versions
}

/** English is the base version. Other languages are added onto that lesson. */
export function orderLessonFiles(files: WorkbookLessonFile[]): WorkbookLessonFile[] {
  return [...files].sort((left, right) => {
    const leftEnglish = left.language === 'English' ? 0 : 1
    const rightEnglish = right.language === 'English' ? 0 : 1
    if (leftEnglish !== rightEnglish) return leftEnglish - rightEnglish
    const byLanguage = left.language.localeCompare(right.language)
    if (byLanguage !== 0) return byLanguage
    return left.fileName.localeCompare(right.fileName)
  })
}
