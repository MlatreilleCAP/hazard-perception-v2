import { describe, expect, it } from 'vitest'
import {
  mainTitleWithCountry,
  projectActivityTitle,
  sharedLessonTitle,
} from '@/lib/inroadsMvp/lessonVersions'

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

describe('main title with country', () => {
  it('joins the main title and country the same way as the editor header', () => {
    expect(mainTitleWithCountry('Lane Changes', 'France')).toBe('Lane Changes - France')
    expect(mainTitleWithCountry('', 'France')).toBe('Project title - France')
    expect(mainTitleWithCountry('Lane Changes', '')).toBe('Lane Changes')
  })
})

describe('project activity title', () => {
  it('shows the project title without using the lesson title', () => {
    expect(projectActivityTitle('Fleet training')).toBe('Fleet training')
    expect(projectActivityTitle('  Fleet training  ')).toBe('Fleet training')
    expect(projectActivityTitle('')).toBe('Untitled project')
    expect(projectActivityTitle(null)).toBe('Untitled project')
  })
})
