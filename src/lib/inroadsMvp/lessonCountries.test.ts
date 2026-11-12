import { describe, expect, it } from 'vitest'
import {
  LESSON_COUNTRY_OPTIONS,
  canonicalizeLessonCountry,
} from '@/lib/inroadsMvp/lessonCountries'

describe('lesson countries', () => {
  it('includes a country for every region in the list', () => {
    expect(LESSON_COUNTRY_OPTIONS).toContain('Canada')
    expect(LESSON_COUNTRY_OPTIONS).toContain('France')
    expect(LESSON_COUNTRY_OPTIONS).toContain('United States')
    expect(LESSON_COUNTRY_OPTIONS).toEqual(expect.arrayContaining([
      'Latin America LHD',
      'Latin America',
      'Europe',
      'Europe LHD',
      'Africa',
      'Africa LHD',
      'Asia',
      'Asia LHD',
      'Middle East',
      'Middle East LHD',
    ]))
    expect(LESSON_COUNTRY_OPTIONS.length).toBeGreaterThan(200)
  })

  it('keeps stored country names on the list', () => {
    expect(canonicalizeLessonCountry('USA')).toBe('United States')
    expect(canonicalizeLessonCountry('Czech Republic')).toBe('Czechia')
    expect(canonicalizeLessonCountry('Turkey')).toBe('Türkiye')
    expect(canonicalizeLessonCountry('France')).toBe('France')
    expect(canonicalizeLessonCountry('latin america lhd')).toBe('Latin America LHD')
    expect(canonicalizeLessonCountry('Middle East')).toBe('Middle East')
    expect(canonicalizeLessonCountry('fra')).toBe('France')
    expect(LESSON_COUNTRY_OPTIONS).toContain(canonicalizeLessonCountry('USA'))
  })
})
