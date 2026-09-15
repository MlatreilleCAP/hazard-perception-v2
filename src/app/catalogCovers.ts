export const CATALOG_COVER_IMAGES = [
  '/galina-nelyubova-UDvOZeqULCM-unsplash.jpg',
  '/mohamed-nohassi-qcenoFmEdbQ-unsplash.jpg',
  '/alex-shuper-IOusOQundeI-unsplash.jpg',
] as const

export function catalogCoverAt(index: number): string {
  return CATALOG_COVER_IMAGES[index % CATALOG_COVER_IMAGES.length]!
}

/** First unique lesson-version key wins, matching DemoCatalog group order. */
export function catalogCoverForTitle(
  title: string,
  catalogTitlesInOrder: readonly string[],
): string {
  const target = title.trim().toLowerCase()
  const seen = new Set<string>()
  let index = 0
  for (const item of catalogTitlesInOrder) {
    const key = item.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    if (key === target) return catalogCoverAt(index)
    seen.add(key)
    index += 1
  }
  return catalogCoverAt(0)
}
