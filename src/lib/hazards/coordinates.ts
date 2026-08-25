export type ContentRect = {
  left: number
  top: number
  width: number
  height: number
}

/** Ignore pans smaller than this so a tap can still register. */
export const VIDEO_PAN_SLOP_PX = 10

/**
 * Original hazard player: shift the centered landscape pan so more of the
 * left side of the clip is visible (forward roadway).
 */
export const SEE_INITIAL_PAN_OFFSET_X = 92

export function videoAspectRatio(
  videoWidth: number,
  videoHeight: number,
  fallback = 16 / 9,
): number {
  if (!videoWidth || !videoHeight) return fallback
  return videoWidth / videoHeight
}

/**
 * Size a landscape clip for a portrait viewport: fill height, overflow width.
 */
export function landscapeVideoDisplaySize(
  viewportWidth: number,
  viewportHeight: number,
  aspectRatio: number,
): { width: number; height: number } {
  const height = Math.max(0, viewportHeight)
  const width = Math.max(height * aspectRatio, Math.max(0, viewportWidth))
  return { width, height }
}

export function getVideoContentRect(video: HTMLVideoElement): ContentRect {
  const container = video.getBoundingClientRect()
  const { videoWidth: vw, videoHeight: vh } = video

  if (!vw || !vh || container.width <= 0 || container.height <= 0) {
    return {
      left: container.left,
      top: container.top,
      width: container.width,
      height: container.height,
    }
  }

  const objectFit = getComputedStyle(video).objectFit
  if (objectFit === 'fill') {
    return {
      left: container.left,
      top: container.top,
      width: container.width,
      height: container.height,
    }
  }

  const scale =
    objectFit === 'cover'
      ? Math.max(container.width / vw, container.height / vh)
      : Math.min(container.width / vw, container.height / vh)
  const width = vw * scale
  const height = vh * scale

  return {
    left: container.left + (container.width - width) / 2,
    top: container.top + (container.height - height) / 2,
    width,
    height,
  }
}

export function clientToPercent(
  clientX: number,
  clientY: number,
  video: HTMLVideoElement,
): { x: number; y: number } {
  const rect = getVideoContentRect(video)
  const x = ((clientX - rect.left) / rect.width) * 100
  const y = ((clientY - rect.top) / rect.height) * 100
  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
  }
}

export function videoContentRectRelative(
  video: HTMLVideoElement,
  container: HTMLElement,
): ContentRect {
  const absolute = getVideoContentRect(video)
  const box = container.getBoundingClientRect()
  return {
    left: absolute.left - box.left,
    top: absolute.top - box.top,
    width: absolute.width,
    height: absolute.height,
  }
}
