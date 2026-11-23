import { describe, expect, it } from 'vitest'
import {
  buildLessonResultsModel,
  randomLessonSectionResult,
  withSkippedSectionResults,
  type LessonSectionResult,
} from '@/types/lesson'

describe('skipped section results', () => {
  it('fills only the sections that have no recorded result', () => {
    const see: LessonSectionResult = {
      kind: 'see',
      spotted: 1,
      total: 1,
      hazards: [{ id: 'played', correct: true, attempts: 1, identifyRatio: 0 }],
      metrics: [],
    }
    const filled = withSkippedSectionResults({ see }, ['see', 'process', 'anticipate'])
    expect(filled.see).toBe(see)
    expect(filled.process?.kind).toBe('process')
    expect(filled.anticipate?.kind).toBe('anticipate')
    expect(filled.process?.metrics.length).toBeGreaterThan(0)
  })

  it('shows a skipped section on the results model', () => {
    const model = buildLessonResultsModel(
      'Parking',
      withSkippedSectionResults({}, ['see', 'process']),
    )
    expect(model.sections.map((section) => section.id)).toEqual(['see', 'know'])
    expect(model.sections.every((section) => section.metrics.length > 0)).toBe(true)
  })

  it('builds a result for each section kind', () => {
    expect(randomLessonSectionResult('see').kind).toBe('see')
    expect(randomLessonSectionResult('process').totalCount).toBe(3)
    expect(randomLessonSectionResult('anticipate').metrics).toHaveLength(3)
  })
})
