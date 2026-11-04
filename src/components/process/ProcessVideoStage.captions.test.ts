import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProcessVideoStage from '@/components/process/ProcessVideoStage.vue'
import SeeMissedVideoOverlay from '@/components/see/SeeMissedVideoOverlay.vue'
import { loadCaptionPreference, setCaptionsEnabled } from '@/lib/media/captionPreference'

vi.mock('@/app/container', () => ({
  services: {
    media: {
      getTextContent: vi.fn(async () => 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello'),
    },
  },
}))

function captionButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('button.process-captions-toggle')
}

describe('closed captions across videos', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setCaptionsEnabled(false)
    loadCaptionPreference()
  })

  it('starts off, then stays on for the next player', async () => {
    const first = mount(ProcessVideoStage, {
      props: { src: 'clip-a.mp4', instructionText: '', captionsMediaId: 'captions-a' },
    })
    await flushPromises()
    expect(captionButton(first).attributes('aria-pressed')).toBe('false')

    await captionButton(first).trigger('click')
    expect(captionButton(first).attributes('aria-pressed')).toBe('true')
    first.unmount()

    const next = mount(SeeMissedVideoOverlay, {
      props: { src: 'clip-b.mp4', captionsMediaId: 'captions-b' },
    })
    await flushPromises()
    expect(captionButton(next).attributes('aria-pressed')).toBe('true')
    next.unmount()
  })
})
