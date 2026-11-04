import { describe, expect, it } from 'vitest'
import { canonicalActivityId, isActivityUuid } from '@/app/id'

const LESSON_ID = 'c44e3a8f-b115-499d-aaff-ed86b4025f5c'

describe('activity ids', () => {
  it('accepts a stored activity id', () => {
    expect(isActivityUuid(LESSON_ID)).toBe(true)
    expect(canonicalActivityId(`  ${LESSON_ID}  `)).toBe(LESSON_ID)
  })

  it('rejects a blank id before it can be sent to Postgres', () => {
    expect(isActivityUuid('')).toBe(false)
    expect(isActivityUuid('   ')).toBe(false)
    expect(canonicalActivityId('')).toBe('')
    expect(canonicalActivityId(null)).toBe('')
    expect(canonicalActivityId(undefined)).toBe('')
  })
})
