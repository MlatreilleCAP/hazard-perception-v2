<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import { isWorkbookName, WORKBOOK_FILE_ACCEPT } from '@/lib/inroadsMvp/packageSpec'
import {
  importInroadsMvpWorkbooks,
  type BulkWorkbookImportFailure,
  type BulkWorkbookImportResult,
} from '@/services/bulkImportInroadsMvp'
import { useActivityStore } from '@/stores/activityStore'

const router = useRouter()
const activities = useActivityStore()
const selected = ref<File[]>([])
const dragging = ref(false)
const uploading = ref(false)
const progress = ref<string | null>(null)
const results = ref<BulkWorkbookImportResult[]>([])
const failures = ref<BulkWorkbookImportFailure[]>([])

function addFiles(incoming: File[]): void {
  if (uploading.value || incoming.length === 0) return
  const next = [...selected.value]
  const rejected: BulkWorkbookImportFailure[] = []
  for (const file of incoming) {
    if (!isWorkbookName(file.name)) {
      rejected.push({ fileName: file.name, message: 'Choose a .xls or .xlsx file.' })
      continue
    }
    const index = next.findIndex((item) => item.name === file.name)
    if (index >= 0) next.splice(index, 1, file)
    else next.push(file)
  }
  selected.value = next
  if (rejected.length > 0) failures.value = rejected
}

function onFile(event: Event): void {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  input.value = ''
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}

function removeFile(index: number): void {
  if (uploading.value) return
  selected.value = selected.value.filter((_, itemIndex) => itemIndex !== index)
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

async function importSelected(): Promise<void> {
  const files = [...selected.value]
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
    if (report.failures.length === 0) selected.value = []
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
        Add every spreadsheet for the lessons you want to create. Files with the same title and
        country become one lesson, and each file is a language. End the file name with the
        language, for example Lane Changes_Poland_English.xlsx.
      </p>

      <div
        class="author-panel bulk-import"
        :class="{ 'is-dragging': dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <label class="bulk-add">
          <span class="author-pill author-pill-primary">Add spreadsheets</span>
          <input
            type="file"
            multiple
            :accept="WORKBOOK_FILE_ACCEPT"
            :disabled="uploading"
            @change="onFile"
          />
        </label>
        <p class="author-muted">
          The file dialog may highlight one file at a time. Select another with Add spreadsheets,
          or drop several files here.
        </p>

        <ul v-if="selected.length" class="bulk-file-list">
          <li v-for="(file, index) in selected" :key="file.name">
            <span>{{ file.name }}</span>
            <button type="button" :disabled="uploading" @click="removeFile(index)">Remove</button>
          </li>
        </ul>

        <AuthorPillButton
          variant="primary"
          :disabled="uploading || selected.length === 0"
          @click="importSelected"
        >
          {{ uploading ? 'Uploading…' : selected.length > 1 ? `Import ${selected.length} files` : 'Import' }}
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

<style scoped>
.bulk-import {
  align-items: flex-start;
}

.bulk-import.is-dragging {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.bulk-add {
  position: relative;
  display: inline-flex;
}

.bulk-add input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.bulk-file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bulk-file-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 14px;
}

.bulk-file-list button {
  border: 0;
  background: none;
  padding: 0;
  color: var(--editor-muted);
  font: inherit;
  cursor: pointer;
}

.bulk-file-list button:disabled {
  cursor: default;
}
</style>
