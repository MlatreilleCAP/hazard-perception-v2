import type { MediaRef } from '@/types/media'
import {
  canonicalizeLessonCountry,
  canonicalizeLessonLanguage,
} from '@/lib/inroadsMvp/packageSpec'

export const INTRODUCTION_TAG = 'introduction'
export const INTRODUCTION_NODE_TYPE = 'introduction.video'

export type IntroductionDefinition = {
  version: 1
  introMedia: MediaRef | null
  introShowOnFirstVisitOnly: boolean
  country: string
  language: string
}

export function isIntroductionActivity(tags: string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes(INTRODUCTION_TAG)
}

export function createDefaultIntroductionDefinition(): IntroductionDefinition {
  return {
    version: 1,
    introMedia: null,
    introShowOnFirstVisitOnly: true,
    country: '',
    language: '',
  }
}

export function cloneIntroductionDefinition(
  definition: IntroductionDefinition,
): IntroductionDefinition {
  return {
    version: 1,
    introMedia: definition.introMedia
      ? { media_asset_id: definition.introMedia.media_asset_id }
      : null,
    introShowOnFirstVisitOnly: definition.introShowOnFirstVisitOnly !== false,
    country: definition.country,
    language: definition.language,
  }
}

export function normalizeIntroductionDefinition(
  raw: Partial<IntroductionDefinition> | null | undefined,
): IntroductionDefinition {
  const introRaw = raw?.introMedia
  let introMedia: MediaRef | null = null
  if (introRaw && typeof introRaw === 'object') {
    const id = (introRaw as { media_asset_id?: unknown }).media_asset_id
    if (typeof id === 'string' && id.trim()) {
      introMedia = { media_asset_id: id.trim() }
    }
  }
  return {
    version: 1,
    introMedia,
    introShowOnFirstVisitOnly: raw?.introShowOnFirstVisitOnly !== false,
    country: canonicalizeLessonCountry(typeof raw?.country === 'string' ? raw.country : ''),
    language: canonicalizeLessonLanguage(typeof raw?.language === 'string' ? raw.language : ''),
  }
}
