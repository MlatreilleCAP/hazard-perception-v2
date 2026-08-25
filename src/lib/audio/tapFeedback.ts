let audioContext: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    audioContext = new Ctor()
  }
  return audioContext
}

export function unlockTapAudio(): void {
  const ctx = context()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined)
  }
}

function tone(
  frequency: number,
  durationMs: number,
  gainValue: number,
  type: OscillatorType = 'sine',
): void {
  const ctx = context()
  if (!ctx) return
  const now = ctx.currentTime
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, now)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(now)
  oscillator.stop(now + durationMs / 1000 + 0.02)
}

/** Short miss tick that plays with the attempt ring. */
export function playMissTapSound(): void {
  unlockTapAudio()
  tone(220, 90, 0.08, 'triangle')
}

let hitClip: HTMLAudioElement | null = null

export const CONFETTI_BURST_SRC = `${import.meta.env.BASE_URL}sounds/confetti-burst.wav`

function hitAudio(): HTMLAudioElement {
  if (!hitClip) {
    hitClip = new Audio(CONFETTI_BURST_SRC)
  }
  return hitClip
}

/** Confetti burst clip that plays when the learner spots a hazard. */
export function playHitTapSound(): void {
  unlockTapAudio()
  const audio = hitAudio()
  audio.currentTime = 0
  void audio.play().catch(() => {
    tone(880, 140, 0.1, 'sine')
    tone(1320, 180, 0.06, 'triangle')
  })
}

export function stopHitTapSound(): void {
  if (!hitClip) return
  hitClip.pause()
  hitClip.currentTime = 0
}
