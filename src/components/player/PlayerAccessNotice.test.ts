import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { describePlayerAccess, formatDemoTimestamp } from '@/lib/demo/accessMessage'
import PlayerAccessNotice from '@/components/player/PlayerAccessNotice.vue'

describe('PlayerAccessNotice', () => {
  it('shows expired, deactivated, and incomplete setup without a database code', () => {
    const expiry = '2026-11-03T22:00:00.000Z'
    const messages = [
      describePlayerAccess({
        status: 'expired',
        startsAt: '2026-11-01T00:00:00.000Z',
        expiresAt: expiry,
        deactivatedAt: null,
      }, true),
      describePlayerAccess({
        status: 'deactivated',
        startsAt: '2026-11-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
        deactivatedAt: expiry,
      }, true),
      describePlayerAccess(null, true),
    ]
    for (const message of messages) {
      const wrapper = mount(PlayerAccessNotice, { props: { message } })
      expect(wrapper.text()).toContain(message)
      expect(wrapper.text()).not.toContain('account_access_blocked')
    }
    expect(messages[0]).toContain(formatDemoTimestamp(expiry))
    expect(messages[1]).toContain('deactivated')
    expect(messages[2]).toContain('setup is incomplete')
  })

  it('renders nothing when access is allowed', () => {
    const wrapper = mount(PlayerAccessNotice, { props: { message: null } })
    expect(wrapper.text()).toBe('')
  })
})
