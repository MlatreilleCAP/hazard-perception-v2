import { ref } from 'vue'

const STORAGE_KEY = 'inroads.captions'

/** Shared across players. A new browser session starts with captions off. */
export const captionsEnabled = ref(false)

function readStored(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeStored(value: boolean): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Private browsing can block storage. The in-memory choice still applies.
  }
}

export function loadCaptionPreference(): void {
  captionsEnabled.value = readStored()
}

export function setCaptionsEnabled(value: boolean): void {
  captionsEnabled.value = value
  writeStored(value)
}

loadCaptionPreference()
