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

function accumulatedCssZoom(start: Element): number {
  let zoom = 1
  let node: Element | null = start
  while (node instanceof HTMLElement) {
    const raw = getComputedStyle(node).getPropertyValue('zoom').trim()
    if (raw && raw !== 'normal') {
      const value = raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw)
      if (Number.isFinite(value) && value > 0) zoom *= value
    }
    node = node.parentElement
  }
  return zoom
}

/**
 * Screen px per layout px. Chrome’s CSS zoom does not scale getBoundingClientRect
 * the way transform: scale does, so a 1:1 rect/layout ratio still needs zoom.
 */
export function elementScreenScale(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  const layoutW = Math.max(1, el.clientWidth)
  const layoutH = Math.max(1, el.clientHeight)
  const rectScaleX = rect.width / layoutW
  const rectScaleY = rect.height / layoutH
  const zoom = accumulatedCssZoom(el)
  return {
    x: Math.abs(rectScaleX - 1) < 0.02 && Math.abs(zoom - 1) > 0.02 ? zoom : rectScaleX,
    y: Math.abs(rectScaleY - 1) < 0.02 && Math.abs(zoom - 1) > 0.02 ? zoom : rectScaleY,
  }
}

function planeLayoutPanX(plane: HTMLElement, panX: number): number {
  const leftPx = Number.parseFloat(getComputedStyle(plane).left)
  if (Number.isFinite(leftPx) && Math.abs(leftPx) > 0.5) return -leftPx
  return panX
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

/** Map a tap on the clipped viewport onto the full panned video plane. */
export function mapClientToPannedPlane(
  clientX: number,
  clientY: number,
  stage: HTMLElement,
  plane: HTMLElement,
  panX = 0,
): { x: number; y: number; frame: { width: number; height: number } } {
  // Convert screen taps into plane layout percent. Production scales the phone
  // with CSS zoom, which Chromium does not bake into descendant bounding rects,
  // so using the plane’s getBoundingClientRect() as percent space drifts off
  // the authored hazard. Safari’s transform: scale is already in the rect.
  const stageRect = stage.getBoundingClientRect()
  const { x: scaleX, y: scaleY } = elementScreenScale(stage)
  const layoutPan = planeLayoutPanX(plane, panX)
  const xPx = (clientX - stageRect.left) / Math.max(0.01, scaleX) + layoutPan
  const yPx = (clientY - stageRect.top) / Math.max(0.01, scaleY)
  const width = Math.max(1, plane.offsetWidth)
  const height = Math.max(1, plane.offsetHeight)
  return {
    x: clampPercent((xPx / width) * 100),
    y: clampPercent((yPx / height) * 100),
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
