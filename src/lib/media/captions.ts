export type CaptionCue = {
  start: number
  end: number
  text: string
}

function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(':')
  if (parts.length < 2 || parts.length > 3) return null
  const secondsPart = parts[parts.length - 1] ?? ''
  const minutes = Number(parts[parts.length - 2] ?? 0)
  const hours = parts.length === 3 ? Number(parts[0]) : 0
  const seconds = Number(secondsPart.replace(',', '.'))
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return null
  return hours * 3600 + minutes * 60 + seconds
}

/** Minimal WebVTT parser for timed text cues. */
export function parseWebVtt(source: string): CaptionCue[] {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = normalized.split(/\n\n+/)
  const cues: CaptionCue[] = []

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line, index, all) => !(index === 0 && all.length > 1 && line === 'WEBVTT') && line !== 'WEBVTT')
    if (lines.length === 0) continue

    let timingIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingIndex < 0) continue
    // Skip numeric/identifier cue ids above the timing line.
    const timingLine = lines[timingIndex] ?? ''
    const [startRaw, endRaw] = timingLine.split('-->').map((part) => part.trim().split(/\s+/)[0] ?? '')
    const start = parseTimestamp(startRaw)
    const end = parseTimestamp(endRaw)
    if (start == null || end == null || end <= start) continue
    const text = lines
      .slice(timingIndex + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (!text) continue
    cues.push({ start, end, text })
  }

  return cues
}

export function activeCaptionText(cues: readonly CaptionCue[], timeSeconds: number): string {
  if (!Number.isFinite(timeSeconds)) return ''
  for (let i = cues.length - 1; i >= 0; i -= 1) {
    const cue = cues[i]
    if (!cue) continue
    if (timeSeconds >= cue.start && timeSeconds < cue.end) return cue.text
  }
  return ''
}

/**
 * Load captions from a signed (or public) URL into parsed cues.
 * Prefer MediaService.getTextContent for private storage assets to avoid CORS.
 */
export async function loadCaptionsFromUrl(url: string): Promise<CaptionCue[]> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load captions (${response.status})`)
  }
  return parseWebVtt(await response.text())
}

export function parseCaptionsText(text: string): CaptionCue[] {
  return parseWebVtt(text)
}
