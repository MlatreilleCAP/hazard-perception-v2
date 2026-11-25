import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useAuthorAutosave } from '@/composables/useAuthorAutosave'

describe('useAuthorAutosave', () => {
  it('writes a newer edit after an in-flight save finishes', async () => {
    const editable = ref(true)
    const loading = ref(false)
    const writes: string[] = []
    let releaseFirst: (() => void) | null = null
    let started = 0
    const autosave = useAuthorAutosave({
      editable,
      loading,
      delayMs: 1,
      save: () => {
        started += 1
        const attempt = started
        if (attempt === 1) {
          return new Promise((resolve) => {
            releaseFirst = () => {
              writes.push('first')
              resolve(true)
            }
          })
        }
        writes.push('second')
        return Promise.resolve(true)
      },
    })

    const first = autosave.flush()
    await Promise.resolve()
    autosave.schedule()
    releaseFirst?.()
    await first
    await Promise.resolve()

    expect(writes).toEqual(['first', 'second'])
  })
})
