import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { services } from '@/app/container'
import { getSupabaseStatus } from '@/services/supabase'

export const useAppStore = defineStore('app', () => {
  const bootedAt = ref(new Date().toISOString())
  const supabase = getSupabaseStatus()
  const nodePlugins = computed(() =>
    services.nodes.list().map((plugin) => ({
      type: plugin.type,
      label: plugin.label,
      category: plugin.category,
    })),
  )
  const persistenceMode = services.persistence.driver

  return {
    bootedAt,
    supabase,
    nodePlugins,
    persistenceMode,
  }
})
