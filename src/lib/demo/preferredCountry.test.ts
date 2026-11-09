import { describe, expect, it } from 'vitest'
import { DEFAULT_DEMO_COUNTRY, startingDemoCountry } from '@/lib/demo/preferredCountry'

describe('startingDemoCountry', () => {
  it('opens on the saved country when that country has a published lesson', () => {
    expect(startingDemoCountry({
      preferred: 'Italy',
      published: ['United States', 'Italy'],
      current: DEFAULT_DEMO_COUNTRY,
      touched: false,
    })).toBe('Italy')
  })

  it('stays on United States when the saved country has no published lesson', () => {
    expect(startingDemoCountry({
      preferred: 'France',
      published: ['United States', 'Italy'],
      current: DEFAULT_DEMO_COUNTRY,
      touched: false,
    })).toBe('United States')
  })

  it('keeps a country the person already chose', () => {
    expect(startingDemoCountry({
      preferred: 'Italy',
      published: ['United States', 'Italy'],
      current: 'United States',
      touched: true,
    })).toBe('United States')
  })

  it('stays on United States when the account has no preference', () => {
    expect(startingDemoCountry({
      preferred: '',
      published: ['Italy', 'United States'],
      current: DEFAULT_DEMO_COUNTRY,
      touched: false,
    })).toBe('United States')
  })
})
