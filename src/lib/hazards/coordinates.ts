export type ContentRect = {
  left: number
  top: number
  width: number
  height: number
}

/** Ignore pans smaller than this so a tap can still register. */
export const VIDEO_PAN_SLOP_PX = 10

/**
 * Landscape clips start centered in the portrait viewport.
 */
export const SEE_INITIAL_PAN_OFFSET_X = 0

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

export function mapClientToRect(
  clientX: number,
  clientY: number,
  rect: ContentRect,
): { x: number; y: number; frame: { width: number; height: number } } {
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)
  return {
    x: Math.min(100, Math.max(0, ((clientX - rect.left) / width) * 100)),
    y: Math.min(100, Math.max(0, ((clientY - rect.top) / height) * 100)),
    frame: { width, height },
  }
}

/** Map a client point into video percent space using one shared rect for hit testing. */
export function mapClientToVideo(
  clientX: number,
  clientY: number,
  video: HTMLVideoElement,
): { x: number; y: number; frame: { width: number; height: number } } {
  return mapClientToRect(clientX, clientY, getVideoContentRect(video))
}

export function mapClientToElement(
  clientX: number,
  clientY: number,
  element: HTMLElement,
): { x: number; y: number; frame: { width: number; height: number } } {
  return mapClientToRect(clientX, clientY, element.getBoundingClientRect())
}

/** Map a tap on the clipped viewport onto the full panned video plane. */
export function mapClientToPannedPlane(
  clientX: number,
  clientY: number,
  stage: HTMLElement,
  plane: HTMLElement,
  panX = 0,
): { x: number; y: number; frame: { width: number; height: number } } {
  // Use the plane’s visual box so CSS zoom on the phone frame (production) and
  // transform: scale (Safari) both map onto the same percent space as the
  // rendered video. Mixing getBoundingClientRect with offsetWidth + panX drifts
  // when zoom changes layout metrics.
  const planeRect = plane.getBoundingClientRect()
  if (planeRect.width > 1 && planeRect.height > 1) {
    return mapClientToRect(clientX, clientY, planeRect)
  }

  const stageRect = stage.getBoundingClientRect()
  const stageWidth = Math.max(1, stageRect.width)
  const stageHeight = Math.max(1, stageRect.height)
  const layoutWidth = Math.max(1, stage.clientWidth)
  const layoutHeight = Math.max(1, stage.clientHeight)
  const xPx = ((clientX - stageRect.left) / stageWidth) * layoutWidth + panX
  const yPx = ((clientY - stageRect.top) / stageHeight) * layoutHeight
  const width = Math.max(1, plane.offsetWidth)
  const height = Math.max(1, plane.offsetHeight)
  return {
    x: Math.min(100, Math.max(0, (xPx / width) * 100)),
    y: Math.min(100, Math.max(0, (yPx / height) * 100)),
    frame: { width, height },
  }
}

export function clientToPercent(
  clientX: number,
  clientY: number,
  video: HTMLVideoElement,
): { x: number; y: number } {
  const mapped = mapClientToVideo(clientX, clientY, video)
  return { x: mapped.x, y: mapped.y }
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
