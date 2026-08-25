import { defineStore } from 'pinia'
import { ref } from 'vue'
import { services } from '@/app/container'
import type { ActivityDefinition, RuntimeState } from '@/types'

export const useRuntimeStore = defineStore('runtime', () => {
  const session = ref<RuntimeState | null>(null)
  const error = ref<string | null>(null)

  async function play(activityId: string): Promise<void> {
    error.value = null
    try {
      const definition = await services.persistence.getPublished(activityId)
      if (!definition) {
        throw new Error(`Activity ${activityId} has no published version`)
      }
      start(definition)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to start activity'
      session.value = null
    }
  }

  function playDefinition(definition: ActivityDefinition): void {
    error.value = null
    try {
      start(definition)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to start activity'
      session.value = null
    }
  }

  function stop(): void {
    if (!session.value) return
    session.value = services.engine.stop()
  }

  function start(definition: ActivityDefinition): void {
    services.engine.load(definition)
    session.value = services.engine.start()
  }

  function setError(message: string | null): void {
    error.value = message
    if (message) {
      session.value = null
    }
  }

  return {
    session,
    error,
    play,
    playDefinition,
    stop,
    setError,
  }
})
