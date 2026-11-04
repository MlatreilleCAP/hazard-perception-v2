import { describe, expect, it } from 'vitest'
import { previewCardTitle, sharedLessonTitle } from '@/lib/inroadsMvp/lessonVersions'

describe('shared lesson title', () => {
  it('uses the English spreadsheet title for every language', () => {
    expect(sharedLessonTitle('English', 'Lane Changes', 'Old name')).toBe('Lane Changes')
    expect(sharedLessonTitle('en', 'Lane Changes', 'Old name')).toBe('Lane Changes')
  })

  it('keeps the existing English title when another language is imported', () => {
    expect(sharedLessonTitle('French', 'Changements de voie', 'Lane Changes')).toBe('Lane Changes')
    expect(sharedLessonTitle('Spanish', '', 'Lane Changes')).toBe('Lane Changes')
  })

  it('falls back to the imported title when the lesson has none yet', () => {
    expect(sharedLessonTitle('French', 'Changements de voie', '')).toBe('Changements de voie')
    expect(sharedLessonTitle('English', '', 'Lane Changes')).toBe('Lane Changes')
  })
})

describe('preview card title', () => {
  it('uses the lesson title on demo cards, not the activity name', () => {
    expect(previewCardTitle('Lane Changes', 'Fleet training')).toBe('Lane Changes')
    expect(previewCardTitle('', 'Fleet training')).toBe('Fleet training')
    expect(previewCardTitle('  Lane Changes  ', 'Fleet training')).toBe('Lane Changes')
  })
})
