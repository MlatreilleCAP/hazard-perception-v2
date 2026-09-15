export type WarmMediaKind = 'video' | 'audio' | 'image'

export type WarmMediaRequest = {
  url: string
  kind: WarmMediaKind
}

const DEFAULT_TIMEOUT_MS = 4_000

export function prefersHttpMediaWarm(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iP(hone|ad|od)/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** Chrome/Edge on Windows (and Android) often allow only one hardware video decoder. */
function usesExclusiveVideoDecoder(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Windows NT|Android/i.test(navigator.userAgent)
}

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
    if (signal?.aborted) return
    if (request.kind === 'image') {
      await this.warmImage(request.url, timeoutMs, signal)
      return
    }
    // iPhone: do not download the full file or occupy a decoder. Signed URLs
    // plus the visible player are enough and stay as fast as per-section load.
    if (prefersHttpMediaWarm()) return
    // Windows/Android Chrome: a hidden <video> can steal the only decoder from
    // the visible Observe/Process player, so cache over HTTP instead.
    if (request.kind === 'video' && usesExclusiveVideoDecoder()) {
      await this.warmHttp(request.url, timeoutMs, signal)
      return
    }
    await this.warmPlayback(request.kind, request.url, timeoutMs, signal)
  }

  releaseDecoders(): void {
    const kept: HTMLElement[] = []
    for (const node of this.nodes) {
      if (node instanceof HTMLMediaElement) {
        node.removeAttribute('src')
        node.load()
        node.remove()
        continue
      }
      kept.push(node)
    }
    this.nodes = kept
  }

  dispose(): void {
    this.releaseDecoders()
    for (const node of this.nodes) node.remove()
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
    this.host?.appendChild(image)

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

  private async warmHttp(
    url: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    await Promise.race([
      fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache', signal })
        .then((response) => (response.ok ? response.blob() : undefined))
        .then(() => undefined)
        .catch(() => undefined),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs)
      }),
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
      el.setAttribute('playsinline', '')
      el.setAttribute('webkit-playsinline', '')
    }
    this.nodes.push(el)
    this.host?.appendChild(el)

    await Promise.race([
      new Promise<void>((resolve) => {
        const done = () => resolve()
        el.addEventListener('loadeddata', done, { once: true })
        el.addEventListener('error', done, { once: true })
        el.src = url
        el.load()
      }),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs)
      }),
      waitForSignal(signal).catch(() => undefined),
    ])

    el.removeAttribute('src')
    el.load()
    el.remove()
    this.nodes = this.nodes.filter((node) => node !== el)
  }
}
