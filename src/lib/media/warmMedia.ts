export type WarmMediaKind = 'video' | 'audio' | 'image'

export type WarmMediaRequest = {
  url: string
  kind: WarmMediaKind
}

const DEFAULT_TIMEOUT_MS = 12_000

function waitForSignal(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((_, reject) => {
    if (!signal) return
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('Aborted', 'AbortError')),
      { once: true },
    )
  })
}

function attachHidden(host: HTMLElement, node: HTMLElement): void {
  host.appendChild(node)
}

export class MediaWarmPool {
  private host: HTMLDivElement | null = null
  private nodes: HTMLElement[] = []

  constructor() {
    if (typeof document === 'undefined') return
    const host = document.createElement('div')
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText =
      'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9999px;top:0'
    document.body.appendChild(host)
    this.host = host
  }

  async warm(
    request: WarmMediaRequest,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.host || signal?.aborted) return
    if (request.kind === 'image') {
      await this.warmImage(request.url, timeoutMs, signal)
      return
    }
    await this.warmPlayback(request.kind, request.url, timeoutMs, signal)
  }

  dispose(): void {
    for (const node of this.nodes) {
      if (node instanceof HTMLMediaElement) {
        node.removeAttribute('src')
        node.load()
      }
      node.remove()
    }
    this.nodes = []
    this.host?.remove()
    this.host = null
  }

  private async warmImage(
    url: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const image = new Image()
    image.decoding = 'async'
    this.nodes.push(image)
    this.host && attachHidden(this.host, image)

    await Promise.race([
      new Promise<void>((resolve) => {
        image.onload = () => resolve()
        image.onerror = () => resolve()
        image.src = url
        if (image.complete && image.naturalWidth > 0) resolve()
      }),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs)
      }),
      waitForSignal(signal).catch(() => undefined),
    ])
  }

  private async warmPlayback(
    kind: 'video' | 'audio',
    url: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const el = document.createElement(kind)
    el.preload = 'auto'
    el.muted = true
    if (el instanceof HTMLVideoElement) {
      el.playsInline = true
    }
    this.nodes.push(el)
    this.host && attachHidden(this.host, el)

    await Promise.race([
      new Promise<void>((resolve) => {
        const done = () => resolve()
        el.addEventListener('canplaythrough', done, { once: true })
        el.addEventListener('error', done, { once: true })
        el.src = url
        el.load()
      }),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs)
      }),
      waitForSignal(signal).catch(() => undefined),
    ])
  }
}
