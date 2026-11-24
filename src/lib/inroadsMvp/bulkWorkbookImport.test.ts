import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  existingVersionsForWorkbook,
  languageFromWorkbookFileName,
  orderLessonFiles,
  workbookLessonName,
  workbookMatchesExistingLesson,
  type ExistingLessonIdentity,
  type WorkbookLessonFile,
} from '@/lib/inroadsMvp/bulkWorkbookImport'
import { parseImportWorkbook } from '@/lib/inroadsMvp/parseImportPackage'
import { canonicalizeLessonLanguage } from '@/lib/inroadsMvp/packageSpec'

function lesson(language: string, fileName = `${language}.xlsx`): WorkbookLessonFile {
  return {
    fileName,
    lessonName: 'Lane Changes - Poland',
    language,
    title: 'Lane Changes',
    country: 'Poland',
    description: '',
  }
}

function workbookFile(name: string, rows: string[][]): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Activity text')
  const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as Uint8Array
  return new File([bytes], name)
}

describe('bulk workbook lesson identity', () => {
  it('names a lesson from the title and country cells', () => {
    expect(workbookLessonName('Lane Changes', 'Poland')).toBe('Lane Changes - Poland')
    expect(workbookLessonName('Lane Changes', 'poland')).toBe('Lane Changes - Poland')
    expect(workbookLessonName('Lane Changes', '')).toBe('')
  })

  it('reads the language from the end of the file name', () => {
    expect(languageFromWorkbookFileName('Lane Changes_Poland_English.xlsx')).toBe('English')
    expect(languageFromWorkbookFileName('Lane Changes_Poland_Polish.xlsx')).toBe('Polish')
    expect(languageFromWorkbookFileName('Lane Changes_Poland_English (1).xlsx')).toBe('English')
    expect(languageFromWorkbookFileName('lesson.xlsx')).toBe('')
  })

  it('imports English before the other languages', () => {
    const ordered = orderLessonFiles([
      lesson('Polish', 'Lane Changes_Poland_Polish.xlsx'),
      lesson('German', 'Lane Changes_Poland_German.xlsx'),
      lesson('English', 'Lane Changes_Poland_English.xlsx'),
    ])
    expect(ordered.map((item) => item.language)).toEqual(['English', 'German', 'Polish'])
  })

  it('keeps the English title and country when the upload column is translated', async () => {
    const file = workbookFile('Lane Changes_Poland_Polish.xlsx', [
      ['Screen', 'Element', 'Text', 'Upload text', 'When'],
      ['Title', 'Country', 'Poland', 'Polska', 'Always'],
      ['Title', 'Title', 'Lane Changes', 'Zmiana pasa ruchu', 'Always'],
      ['Title', 'Description', 'Interactive driver coaching activity', 'Interaktywne', 'Always'],
    ])
    const parsed = await parseImportWorkbook(file)
    expect(workbookLessonName(parsed.lesson.title, parsed.lesson.country)).toBe('Lane Changes - Poland')
    expect(languageFromWorkbookFileName(file.name)).toBe('Polish')
  })

  it('matches an existing lesson by its landing title and replaces that language', () => {
    const existing: ExistingLessonIdentity = {
      id: 'parking-en',
      title: 'FD Inroads - Parking',
      lessonTitle: 'FD Inroads - Parking',
      country: 'United States',
      language: 'English',
      sku: 'INR_PARK',
    }
    const lesson: WorkbookLessonFile = {
      fileName: 'Parking_United States_English.xlsx',
      lessonName: 'Parking - United States',
      language: 'English',
      title: 'Parking',
      country: 'United States',
      description: '',
      cardTitle: 'FD Inroads - Parking',
      sku: 'INR_PARK',
    }
    expect(workbookMatchesExistingLesson(lesson, existing)).toBe(true)
    expect(existingVersionsForWorkbook(lesson, [existing]).get('English')).toBe('parking-en')
    expect(
      workbookMatchesExistingLesson(lesson, { ...existing, country: 'Canada', sku: '' }),
    ).toBe(false)
    expect(
      workbookMatchesExistingLesson(lesson, { ...existing, sku: 'INR_OTHER' }),
    ).toBe(false)
  })

  it('treats a locale tag as the same language as the file name', () => {
    expect(canonicalizeLessonLanguage('en-SE')).toBe('English')
    expect(canonicalizeLessonLanguage('sv-SE')).toBe('Swedish')
    expect(canonicalizeLessonLanguage('en-us')).toBe('English')
    expect(canonicalizeLessonLanguage('be')).toBe('Belarusian')
    expect(languageFromWorkbookFileName('Lane Changes_Sweden_en-SE.xlsx')).toBe('English')

    const existing: ExistingLessonIdentity = {
      id: 'sweden-original',
      title: 'Lane Changes - Sweden',
      lessonTitle: 'FD Inroads - Lane Changes',
      country: 'Sweden',
      language: 'en-SE',
      sku: '',
      createdAt: '2026-11-20T12:00:00.000Z',
    }
    const duplicate: ExistingLessonIdentity = {
      ...existing,
      id: 'sweden-duplicate',
      createdAt: '2026-11-23T23:00:00.000Z',
    }
    const uploaded: WorkbookLessonFile = {
      fileName: 'Lane Changes_Sweden_English.xlsx',
      lessonName: 'Lane Changes - Sweden',
      language: 'English',
      title: 'Lane Changes',
      country: 'Sweden',
      description: '',
      cardTitle: 'FD Inroads - Lane Changes',
      sku: '',
    }
    const versions = existingVersionsForWorkbook(uploaded, [duplicate, existing])
    expect(versions.get('English')).toBe('sweden-original')
  })
})
