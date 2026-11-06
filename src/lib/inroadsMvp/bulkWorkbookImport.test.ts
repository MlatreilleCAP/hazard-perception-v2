import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  languageFromWorkbookFileName,
  orderLessonFiles,
  workbookLessonName,
  type WorkbookLessonFile,
} from '@/lib/inroadsMvp/bulkWorkbookImport'
import { parseImportWorkbook } from '@/lib/inroadsMvp/parseImportPackage'

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
})
