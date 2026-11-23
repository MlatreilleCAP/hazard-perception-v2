import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildWorkbookBytes, defaultImportWorkbookContent } from '@/lib/inroadsMvp/buildImportTemplate'
import { parseActivityTextSheet } from '@/lib/inroadsMvp/parseActivityTextSheet'

function workbookFromRows(rows: string[][]): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  return {
    SheetNames: ['Activity text'],
    Sheets: { 'Activity text': sheet },
  }
}

describe('keyed activity text', () => {
  it('reads the updated workbook columns into lesson fields', () => {
    const warnings: string[] = []
    const parsed = parseActivityTextSheet(
      workbookFromRows([
        ['Key', 'Screen', 'Element', 'Text', 'Upload text', 'When'],
        ['language', 'Title', 'Language', 'en-US', 'en-US', 'Always'],
        ['template', 'Title', 'Template', 'INR-MVP', 'INR-MVP', 'Always'],
        ['lesson.name', 'Title', 'Title', 'Parking', 'Parking', 'Always'],
        [
          'lesson.node.LANDING_1.title',
          'Landing page',
          'Title',
          'FD Inroads - Parking',
          'FD Inroads - Parking',
          'Always',
        ],
        [
          'lesson.node.LANDING_1.text',
          'Landing page',
          'Text',
          'Interactive driver coaching activity',
          'Interactive driver coaching activity',
          'Always',
        ],
        [
          'lesson.node.TABLE_1.table.1.col.2.text',
          'Clip Intro',
          'Table 1 col 2 text',
          'Maneuver',
          'Maneuver',
          'Always',
        ],
        [
          'lesson.node.TABLE_1.table.1.col.3.text',
          'Clip Intro',
          'Table 1 col 3 text',
          'Traveling straight',
          'Traveling straight',
          'Always',
        ],
        [
          'lesson.node.HAZARD_PERCEPTION_1.attempt.2.success.text',
          'Hazard Perception',
          'Spotted on attempt 2',
          'You got it on your second attempt.',
          'You got it on your second attempt.',
          'On the result, for that outcome',
        ],
        [
          'lesson.node.QUESTION_1.question.Q1.prompt',
          'Observe Coaching Question',
          'Question',
          'What do you still need to do?',
          'What do you still need to do?',
          'Always',
        ],
        [
          'lesson.node.QUESTION_1.question.Q1.answer.A1.body',
          'Observe Coaching Question',
          'Answer A',
          'recheck the mirror',
          'recheck the mirror',
          'Always',
        ],
        [
          'lesson.node.QUESTION_1.question.Q1.answer.A2.body',
          'Observe Coaching Question',
          'Answer B (correct)',
          'check the blind spot',
          'check the blind spot',
          'Always',
        ],
        [
          'lesson.node.QUESTION_2.question.Q1.prompt',
          'Process Challenge Question 1',
          'Question',
          'What happened?',
          'What happened?',
          'Always',
        ],
        [
          'lesson.node.QUESTION_2.question.Q1.answer.A1.body',
          'Process Challenge Question 1',
          'Answer A (correct)',
          'the vehicle forced in',
          'the vehicle forced in',
          'Always',
        ],
        [
          'lesson.node.QUESTION_2.question.Q1.answer.A2.body',
          'Process Challenge Question 1',
          'Answer B',
          'the vehicle waited',
          'the vehicle waited',
          'Always',
        ],
        [
          'global.player.results.item.question',
          'Player',
          'results.item.question',
          'Q{number}',
          'Q{number}',
          'Always',
        ],
        ['global.player.captions', 'Player', 'captions', 'CC', 'CC', 'Always'],
      ]),
      'upload',
      warnings,
    )

    expect(warnings).toEqual([])
    expect(parsed?.lesson.language).toBe('English')
    expect(parsed?.lesson.template).toBe('INR-MVP')
    expect(parsed?.lesson.title).toBe('Parking')
    expect(parsed?.lesson.cardTitle).toBe('FD Inroads - Parking')
    expect(parsed?.lesson.landingText).toBe('Interactive driver coaching activity')
    expect(parsed?.lesson.maneuverHeading).toBe('Maneuver')
    expect(parsed?.copy.observe?.maneuver).toBe('Traveling straight')
    expect(parsed?.copy.observe?.['2_attempts']).toBe('You got it on your second attempt.')
    expect(parsed?.questions.map((question) => [question.section, question.segment])).toEqual([
      ['observe', 1],
      ['process', 1],
    ])
    expect(parsed?.questions[0]?.correctIndex).toBe(1)
    expect(parsed?.lesson.q1).toBe('Q1')
    expect(parsed?.lesson.q4).toBe('Q4')
    expect(parsed?.lesson.playerCopy['global.player.captions']).toBe('CC')
  })

  it('downloads a workbook with the keyed columns', async () => {
    const bytes = await buildWorkbookBytes(defaultImportWorkbookContent())
    const workbook = XLSX.read(bytes, { type: 'array' })
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['Activity text'], {
      header: 1,
      defval: '',
    })
    expect(rows[0]).toEqual(['Key', 'Screen', 'Element', 'Text', 'Upload text', 'When'])
    const keys = rows.slice(1).map((row) => row[0])
    expect(keys).toContain('lesson.node.TEXT_1.title')
    expect(keys).toContain('lesson.node.HAZARD_PERCEPTION_1.attempt.3.failure.text')
    expect(keys).toContain('global.player.submit')
    const language = rows.find((row) => row[0] === 'language')
    expect(language?.[3]).toBe('en-US')
    const warnings: string[] = []
    const parsed = parseActivityTextSheet(workbook, 'text', warnings)
    expect(warnings).toEqual([])
    expect(parsed?.lesson.language).toBe('English')
    expect(parsed?.lesson.template).toBe('INR-MVP')
    expect(parsed?.questions.length).toBeGreaterThan(0)
  })
})
