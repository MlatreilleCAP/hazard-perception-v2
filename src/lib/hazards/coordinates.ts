export type ContentRect = {
  left: number
  top: number
  width: number
  height: number
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
  if (objectFit === 'fill' || objectFit === 'cover') {
    return {
      left: container.left,
      top: container.top,
      width: container.width,
      height: container.height,
    }
  }

  const scale = Math.min(container.width / vw, container.height / vh)
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
