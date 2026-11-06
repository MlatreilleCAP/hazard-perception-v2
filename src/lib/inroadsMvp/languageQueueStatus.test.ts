import { describe, expect, it } from 'vitest'
import { draftLanguageVariantIds } from '@/lib/inroadsMvp/languageQueueStatus'

describe('draft language variants', () => {
  it('marks every draft language available when one language is already available', () => {
    expect(
      draftLanguageVariantIds([
        { id: 'english', status: 'draft' },
        { id: 'polish', status: 'available' },
      ]),
    ).toEqual(['english'])
  })

  it('leaves drafts alone until a language is available', () => {
    expect(
      draftLanguageVariantIds([
        { id: 'english', status: 'draft' },
        { id: 'polish', status: 'draft' },
      ]),
    ).toEqual([])
  })

  it('does not move languages that are already in the queue', () => {
    expect(
      draftLanguageVariantIds([
        { id: 'english', status: 'in_progress' },
        { id: 'polish', status: 'available' },
        { id: 'german', status: 'review' },
      ]),
    ).toEqual([])
  })
})
