<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import { isWorkbookName, WORKBOOK_FILE_ACCEPT } from '@/lib/inroadsMvp/packageSpec'
import { parseImportWorkbook } from '@/lib/inroadsMvp/parseImportPackage'
import { createBlankInroadsMvp } from '@/services/createInroadsMvp'
import { replaceInroadsMvpWorkbook } from '@/services/inroadsMvpImport'
import { removeInroadsMvpParent } from '@/services/removeInroadsMvp'
import { useActivityStore } from '@/stores/activityStore'

const router = useRouter()
const activities = useActivityStore()
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const progress = ref<string | null>(null)
const error = ref<string | null>(null)

function chooseFile(): void {
  if (uploading.value) return
  fileInput.value?.click()
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''
  if (!file || uploading.value) return

  uploading.value = true
  error.value = null
  progress.value = 'Reading spreadsheet…'
  let createdId = ''
  try {
    if (!isWorkbookName(file.name)) {
      throw new Error('Choose a .xls or .xlsx file.')
    }
    const preview = await parseImportWorkbook(file)
    progress.value = 'Creating lesson…'
    createdId = await createBlankInroadsMvp(
      preview.lesson.title.trim() || 'Imported Inroads MVP',
      preview.lesson.description,
      preview.lesson.country,
    )
    await replaceInroadsMvpWorkbook(createdId, file, (message) => {
      progress.value = message
    })
    await activities.refreshList()
    await router.push(`/studio/inroads-mvp/${createdId}`)
  } catch (cause) {
    if (createdId) {
      try {
        await removeInroadsMvpParent(createdId)
      } catch {
        // The import failed; ignore cleanup errors.
      }
    }
    error.value = cause instanceof Error ? cause.message : 'Failed to create lesson from the spreadsheet'
    progress.value = null
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="author-page">
    <div class="author-page-inner author-stack">
      <div class="author-header-row">
        <div class="author-header-left">
          <RouterLink to="/studio/inroads-mvp" class="author-back" aria-label="Back">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path
                d="M10 3.5 5.5 8 10 12.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </RouterLink>
          <h1 class="author-header-title">New Inroads MVP</h1>
        </div>
      </div>

      <p class="author-muted">
        Upload a lesson spreadsheet. Its title, country, and copy become the new lesson.
      </p>

      <div class="author-actions inroads-import-panel">
        <input
          ref="fileInput"
          type="file"
          :accept="WORKBOOK_FILE_ACCEPT"
          :disabled="uploading"
          @change="onFile"
        />
        <AuthorPillButton variant="primary" :disabled="uploading" @click="chooseFile">
          {{ uploading ? 'Uploading…' : 'Upload xls' }}
        </AuthorPillButton>
      </div>

      <p v-if="progress" class="author-muted">{{ progress }}</p>
      <p v-if="error" class="author-error">{{ error }}</p>
    </div>
  </div>
</template>
