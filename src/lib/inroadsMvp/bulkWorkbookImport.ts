import { LESSON_LANGUAGE_OPTIONS } from '@/lib/inroadsMvp/lessonLanguages'
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
