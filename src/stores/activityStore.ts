import { defineStore } from 'pinia'
import { ref } from 'vue'
import { services } from '@/app/container'
import { cloneJson } from '@/app/clone'
import type { ActivityDefinition, ActivitySummary } from '@/types'
import type { ActivityListScope } from '@/types/repository'

export const useActivityStore = defineStore('activity', () => {
  const summaries = ref<ActivitySummary[]>([])
  const current = ref<ActivityDefinition | null>(null)
  const error = ref<string | null>(null)
  const preview = ref<ActivityDefinition | null>(null)

  function stagePreview(definition: ActivityDefinition): void {
    preview.value = cloneJson(definition)
  }

  async function refreshList(scope: ActivityListScope = 'authoring'): Promise<void> {
    error.value = null
    try {
      summaries.value = await services.persistence.list(scope)
    } catch (cause) {
      summaries.value = []
      error.value = cause instanceof Error ? cause.message : 'Failed to list activities'
    }
  }

  async function load(id: string): Promise<void> {
    error.value = null
    try {
      current.value = await services.persistence.getById(id)
    } catch (cause) {
      current.value = null
      error.value = cause instanceof Error ? cause.message : 'Failed to load activity'
    }
  }

  async function save(definition: ActivityDefinition): Promise<void> {
    error.value = null
    try {
      current.value = await services.persistence.save(definition)
      await refreshList()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to save activity'
      throw cause
    }
  }

  async function publish(id: string): Promise<void> {
    error.value = null
    try {
      current.value = await services.persistence.publish(id)
      await refreshList()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to publish activity'
      throw cause
    }
  }

  async function remove(id: string): Promise<void> {
    error.value = null
    try {
      await services.persistence.delete(id)
      if (current.value?.id === id) {
        current.value = null
      }
      await refreshList()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to remove activity'
      throw cause
    }
  }

  return {
    summaries,
    current,
    preview,
    error,
    stagePreview,
    refreshList,
    load,
    save,
    publish,
    remove,
  }
})
