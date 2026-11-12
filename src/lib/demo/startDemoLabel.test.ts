import { describe, expect, it } from 'vitest'
import { startDemoLabel } from '@/lib/demo/startDemoLabel'

describe('startDemoLabel', () => {
  it('uses Begin in English and for an unknown language', () => {
    expect(startDemoLabel('English')).toBe('Begin')
    expect(startDemoLabel('en')).toBe('Begin')
    expect(startDemoLabel('')).toBe('Begin')
    expect(startDemoLabel('Klingon')).toBe('Begin')
  })

  it('follows the selected lesson language', () => {
    expect(startDemoLabel('French')).toBe('Commencer')
    expect(startDemoLabel('fr')).toBe('Commencer')
    expect(startDemoLabel('Spanish')).toBe('Comenzar')
    expect(startDemoLabel('Portuguese')).toBe('Começar')
    expect(startDemoLabel('Arabic')).toBe('ابدأ')
  })
})
