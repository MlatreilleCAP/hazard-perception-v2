import { getCurrentInstance, onBeforeUnmount, type Ref } from 'vue'

const DEFAULT_DELAY_MS = 800

export function useAuthorAutosave(options: {
  editable: Ref<boolean>
  loading: Ref<boolean>
  save: () => Promise<boolean>
  delayMs?: number
}) {
  let timer = 0
  let paused = 0
  let running = false
  let rerun = false
  let current: Promise<boolean> | null = null

  function blocked(): boolean {
    return paused > 0 || options.loading.value || !options.editable.value
  }

  async function run(): Promise<boolean> {
    if (blocked()) return current ?? true
    if (running) {
      rerun = true
      return current ?? true
    }
    running = true
    rerun = false
    let result = true
    current = (async () => {
      try {
        do {
          rerun = false
          if (blocked()) break
          result = await options.save()
        } while (rerun && !blocked())
        return result
      } finally {
        running = false
        current = null
      }
    })()
    return current
  }

  function schedule(): void {
    if (paused > 0 || options.loading.value || !options.editable.value) return
    if (running) {
      rerun = true
      return
    }
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = 0
      void run()
    }, options.delayMs ?? DEFAULT_DELAY_MS)
  }

  function pause(): void {
    paused += 1
    window.clearTimeout(timer)
    timer = 0
  }

  function resume(): void {
    paused = Math.max(0, paused - 1)
  }

  async function flush(): Promise<boolean> {
    window.clearTimeout(timer)
    timer = 0
    if (running) {
      rerun = true
      return current ?? true
    }
    if (blocked()) return true
    return run()
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      void flush()
    })
  }

  return { schedule, pause, resume, flush }
}
