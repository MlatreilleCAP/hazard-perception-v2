import type { LessonReviewStatus } from '@/types/inroadsMvp'

/** Draft languages join Available once any language of the same lesson is already there. */
export function draftLanguageVariantIds(
  variants: Array<{ id: string; status: LessonReviewStatus }>,
): string[] {
  if (!variants.some((item) => item.status === 'available')) return []
  return variants.filter((item) => item.status === 'draft').map((item) => item.id)
}
