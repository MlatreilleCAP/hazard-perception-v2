export const CATALOG_COVER_IMAGES = [
  '/galina-nelyubova-UDvOZeqULCM-unsplash.jpg',
  '/mohamed-nohassi-qcenoFmEdbQ-unsplash.jpg',
  '/alex-shuper-IOusOQundeI-unsplash.jpg',
] as const

export function catalogCoverAt(index: number): string {
  return CATALOG_COVER_IMAGES[index % CATALOG_COVER_IMAGES.length]!
}
