import { beforeEach, describe, expect, it } from 'vitest'
import {
  captionsEnabled,
  loadCaptionPreference,
  setCaptionsEnabled,
} from '@/lib/media/captionPreference'

describe('caption preference', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadCaptionPreference()
  })

  it('starts off when the learner has not chosen', () => {
    expect(captionsEnabled.value).toBe(false)
  })

  it('keeps captions on for the next video after the learner turns them on', () => {
    setCaptionsEnabled(true)
    loadCaptionPreference()
    expect(captionsEnabled.value).toBe(true)
  })

  it('keeps captions off for the next video after the learner turns them off', () => {
    setCaptionsEnabled(true)
    setCaptionsEnabled(false)
    loadCaptionPreference()
    expect(captionsEnabled.value).toBe(false)
  })
})
