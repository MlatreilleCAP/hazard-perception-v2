<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import { WORKBOOK_FILE_ACCEPT } from '@/lib/inroadsMvp/packageSpec'
import {
  importInroadsMvpWorkbooks,
  type BulkWorkbookImportFailure,
  type BulkWorkbookImportResult,
} from '@/services/bulkImportInroadsMvp'
import { useActivityStore } from '@/stores/activityStore'

const router = useRouter()
const activities = useActivityStore()
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const progress = ref<string | null>(null)
const results = ref<BulkWorkbookImportResult[]>([])
const failures = ref<BulkWorkbookImportFailure[]>([])

function chooseFile(): void {
  if (uploading.value) return
  fileInput.value?.click()
}

function actionLabel(action: BulkWorkbookImportResult['action']): string {
  if (action === 'created') return 'Created'
  if (action === 'added-language') return 'Added language'
  return 'Updated'
}

function lessonToOpen(imported: BulkWorkbookImportResult[]): string {
  const names = new Set(imported.map((item) => item.lessonName))
  if (names.size !== 1) return ''
  return imported.find((item) => item.language === 'English')?.lessonId ?? imported[0]?.lessonId ?? ''
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0 || uploading.value) return

  uploading.value = true
  results.value = []
  failures.value = []
  progress.value = files.length === 1 ? 'Reading spreadsheet…' : `Reading ${files.length} spreadsheets…`
  try {
    await activities.refreshList()
    const report = await importInroadsMvpWorkbooks(files, activities.summaries, (message) => {
      progress.value = message
    })
    results.value = report.results
    failures.value = report.failures
    await activities.refreshList()
    const nextId = report.failures.length === 0 ? lessonToOpen(report.results) : ''
    if (nextId) {
      await router.push(`/studio/inroads-mvp/${nextId}`)
      return
    }
    progress.value = null
  } catch (cause) {
    failures.value = [
      {
        fileName: '',
        message: cause instanceof Error ? cause.message : 'Failed to create lessons from the spreadsheets',
      },
    ]
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
        Upload one or more lesson spreadsheets. Each lesson is named from the title and country,
        for example Lane Changes - Poland. Files for the same lesson are added as languages. End
        each file name with the language, for example Lane Changes_Poland_English.xlsx.
      </p>

      <div class="author-actions inroads-import-panel">
        <input
          ref="fileInput"
          type="file"
          multiple
          :accept="WORKBOOK_FILE_ACCEPT"
          :disabled="uploading"
          @change="onFile"
        />
        <AuthorPillButton variant="primary" :disabled="uploading" @click="chooseFile">
          {{ uploading ? 'Uploading…' : 'Upload xls files' }}
        </AuthorPillButton>
      </div>

      <p v-if="progress" class="author-muted">{{ progress }}</p>

      <div v-if="results.length" class="author-stack-sm">
        <p v-for="result in results" :key="`${result.fileName}-${result.language}`" class="author-muted">
          <RouterLink :to="`/studio/inroads-mvp/${result.lessonId}`">
            {{ result.lessonName }} · {{ result.language }}
          </RouterLink>
          — {{ actionLabel(result.action) }}
        </p>
      </div>

      <p v-for="failure in failures" :key="`${failure.fileName}-${failure.message}`" class="author-error">
        {{ failure.fileName ? `${failure.fileName}: ${failure.message}` : failure.message }}
      </p>
    </div>
  </div>
</template>
