import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseActivityTextSheet } from '@/lib/inroadsMvp/parseActivityTextSheet'

function workbookFromRows(rows: string[][]): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  return {
    SheetNames: ['Activity text'],
    Sheets: { 'Activity text': sheet },
  }
}

describe('desktop instruction rows', () => {
  it('imports Observe, Process, and Anticipate desktop instruction screens', () => {
    const workbook = workbookFromRows([
      ['Screen', 'Element', 'Text', 'Upload text', 'When'],
      [
        'Observe Instruction Desktop',
        'Instruction',
        'Observe desktop source',
        'Observe desktop upload',
        'Desktop only; unused in this demo',
      ],
      [
        'Process Instruction Desktop',
        'Instruction',
        'Process desktop source',
        'Process desktop upload',
        'Desktop only; unused in this demo',
      ],
      [
        'Anticipate instructions Desktop',
        'Instruction',
        'Anticipate desktop source',
        'Anticipate desktop upload',
        'Desktop only; unused in this demo',
      ],
    ])

    const parsed = parseActivityTextSheet(workbook, 'upload', [])
    expect(parsed).not.toBeNull()
    expect(parsed?.copy.observe?.instruction_desktop).toBe('Observe desktop upload')
    expect(parsed?.copy.process?.instruction_desktop).toBe('Process desktop upload')
    expect(parsed?.copy.anticipate?.instruction_desktop).toBe('Anticipate desktop upload')
    expect(parsed?.copy.observe?.instruction).toBeUndefined()
    expect(parsed?.copy.process?.instruction).toBeUndefined()
    expect(parsed?.copy.anticipate?.instruction).toBeUndefined()
  })
})
