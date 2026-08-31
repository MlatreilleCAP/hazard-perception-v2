import { onBeforeUnmount, type Ref } from 'vue'

const DEFAULT_DELAY_MS = 800

export function useAuthorAutosave(options: {
  editable: Ref<boolean>
  loading: Ref<boolean>
  save: () => Promise<boolean>
  delayMs?: number
}) {
  let timer = 0
  let paused = 0

  function schedule(): void {
    if (paused > 0 || options.loading.value || !options.editable.value) return
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = 0
      void options.save()
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
    if (paused > 0 || options.loading.value || !options.editable.value) return true
    return options.save()
  }

  onBeforeUnmount(() => {
    void flush()
  })

  return { schedule, pause, resume, flush }
}
