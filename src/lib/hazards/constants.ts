export const DEFAULT_HAZARD_RADIUS = 6
export const MIN_HAZARD_RADIUS = 2
export const MAX_HAZARD_RADIUS = 20

export function clampHazardRadius(radius: number): number {
  return Math.min(MAX_HAZARD_RADIUS, Math.max(MIN_HAZARD_RADIUS, radius))
}

export function getHazardRadius(hazard: { radius?: number }): number {
  return clampHazardRadius(hazard.radius ?? DEFAULT_HAZARD_RADIUS)
}

export function hazardMarkerDiameterPercent(radius: number): number {
  return getHazardRadius({ radius }) * 2
}
