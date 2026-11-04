import { describe, expect, it } from 'vitest'
import { previewCardTitle } from '@/lib/inroadsMvp/lessonVersions'

describe('preview card title', () => {
  it('uses the lesson title on demo cards, not the activity name', () => {
    expect(previewCardTitle('Lane Changes', 'Fleet training')).toBe('Lane Changes')
    expect(previewCardTitle('', 'Fleet training')).toBe('Fleet training')
    expect(previewCardTitle('  Lane Changes  ', 'Fleet training')).toBe('Lane Changes')
  })
})
