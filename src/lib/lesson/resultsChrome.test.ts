import { describe, expect, it } from 'vitest'
import { passMarkWithThreshold } from '@/lib/lesson/resultsChrome'

describe('passMarkWithThreshold', () => {
  it('replaces a stored pass mark with the current threshold', () => {
    expect(passMarkWithThreshold('Note de passage 70 %', 80)).toBe('Note de passage 80 %')
    expect(passMarkWithThreshold('Pass mark 70%', 80)).toBe('Pass mark 80%')
  })
})
