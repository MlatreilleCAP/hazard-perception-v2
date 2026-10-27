<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AuthorPillButton from '@/components/author/AuthorPillButton.vue'
import { downloadBlob } from '@/lib/inroadsMvp/buildImportTemplate'
import {
  SLOT_FOLDER_LABELS,
  WORKBOOK_FILE_ACCEPT,
  WORKBOOK_REPLACE_ID,
  isWorkbookName,
  slotFileAccept,
  type ReplaceSlotId,
} from '@/lib/inroadsMvp/packageSpec'
import {
  exportLessonTemplateZip,
  exportLessonWorkbook,
  exportSampleInroadsMvpTemplateZip,
  exportSampleLessonWorkbook,
} from '@/services/exportInroadsMvpPackage'
import { parseImportWorkbook, parseImportZip } from '@/lib/inroadsMvp/parseImportPackage'
import { createBlankInroadsMvp } from '@/services/createInroadsMvp'
import {
  importInroadsMvpPackage,
  inspectInroadsMvpOccupancy,
  listInroadsMvpSlotFiles,
  occupancyHasContent,
  replaceInroadsMvpSlotFile,
  replaceInroadsMvpWorkbook,
  type ImportPackageReport,
  type InroadsMvpSlotFile,
} from '@/services/inroadsMvpImport'
import { useActivityStore } from '@/stores/activityStore'

const props = defineProps<{
  parentId?: string
  disabled?: boolean
  createLesson?: boolean
  /** Persist on-screen edits before building the zip. Return false to cancel. */
  beforeDownload?: () => Promise<boolean>
}>()

const emit = defineEmits<{
  imported: [parentId: string]
}>()

const activities = useActivityStore()
const zipInput = ref<HTMLInputElement | null>(null)
const slotInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const exporting = ref(false)
const replacingSlot = ref<ReplaceSlotId | null>(null)
const pendingSlot = ref<ReplaceSlotId | null>(null)
const progress = ref<string | null>(null)
const error = ref<string | null>(null)
const report = ref<ImportPackageReport | null>(null)
const slotFiles = ref<InroadsMvpSlotFile[]>([])
const slotsLoading = ref(false)
const replaceMenuOpen = ref(false)
const replaceMenu = ref<HTMLElement | null>(null)
const downloadMenuOpen = ref(false)
const downloadMenu = ref<HTMLElement | null>(null)
const importMenuOpen = ref(false)
const importMenu = ref<HTMLElement | null>(null)
const pendingImport = ref<ImportKind | null>(null)

type TemplateDownload = 'xls' | 'folders' | 'package'
type ImportKind = 'text' | 'media' | 'package'

const busy = computed(() => importing.value || exporting.value || Boolean(replacingSlot.value))
const showSlotReplace = computed(() => Boolean(props.parentId) && !props.createLesson)
const slotAccept = computed(() =>
  pendingSlot.value === WORKBOOK_REPLACE_ID
    ? WORKBOOK_FILE_ACCEPT
    : pendingSlot.value
      ? slotFileAccept(pendingSlot.value)
      : 'video/*,audio/*,image/*,.xls,.xlsx',
)
const importAccept = computed(() =>
  pendingImport.value === 'text' ? WORKBOOK_FILE_ACCEPT : '.zip,application/zip',
)

async function refreshSlotFiles(): Promise<void> {
  if (!props.parentId || props.createLesson) {
    slotFiles.value = []
    return
  }
  slotsLoading.value = true
  try {
    slotFiles.value = await listInroadsMvpSlotFiles(props.parentId)
  } catch {
    slotFiles.value = []
  } finally {
    slotsLoading.value = false
  }
}

function onDocPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Node)) return
  if (replaceMenuOpen.value && !replaceMenu.value?.contains(event.target)) {
    replaceMenuOpen.value = false
  }
  if (downloadMenuOpen.value && !downloadMenu.value?.contains(event.target)) {
    downloadMenuOpen.value = false
  }
  if (importMenuOpen.value && !importMenu.value?.contains(event.target)) {
    importMenuOpen.value = false
  }
}

onMounted(() => {
  void refreshSlotFiles()
  document.addEventListener('pointerdown', onDocPointerDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
})

watch(
  () => props.parentId,
  () => {
    void refreshSlotFiles()
  },
)

function closeMenus(): void {
  replaceMenuOpen.value = false
  downloadMenuOpen.value = false
  importMenuOpen.value = false
}

function toggleDownloadMenu(): void {
  if (props.disabled || busy.value) return
  const next = !downloadMenuOpen.value
  closeMenus()
  downloadMenuOpen.value = next
}

async function downloadTemplate(kind: TemplateDownload): Promise<void> {
  if (props.disabled || busy.value) return
  closeMenus()
  error.value = null
  exporting.value = true
  progress.value =
    kind === 'package'
      ? 'Building package…'
      : kind === 'folders'
        ? 'Building folders…'
        : 'Building workbook…'
  try {
    if (props.beforeDownload) {
      const ready = await props.beforeDownload()
      if (!ready) return
    }
    const onProgress = (message: string) => {
      progress.value = message
    }
    if (props.parentId) {
      if (kind === 'xls') {
        const packed = await exportLessonWorkbook(props.parentId, { onProgress })
        downloadBlob(packed.blob, packed.filename)
      } else {
        const packed = await exportLessonTemplateZip(props.parentId, {
          includeMedia: kind === 'package',
          onProgress,
        })
        downloadBlob(packed.blob, packed.filename)
      }
      return
    }
    if (kind === 'xls') {
      downloadBlob(await exportSampleLessonWorkbook(), 'inroads-mvp.xlsx')
      return
    }
    downloadBlob(
      await exportSampleInroadsMvpTemplateZip(),
      kind === 'package' ? 'inroads-mvp-package.zip' : 'inroads-mvp-template.zip',
    )
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to build download'
  } finally {
    exporting.value = false
    progress.value = null
  }
}

function onZip(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  const kind = pendingImport.value
  input.value = ''
  pendingImport.value = null
  if (file && kind) void runImport(file, kind)
}

function toggleImportMenu(): void {
  if (props.disabled || busy.value) return
  const next = !importMenuOpen.value
  closeMenus()
  importMenuOpen.value = next
}

function chooseImport(kind: ImportKind): void {
  if (props.disabled || busy.value) return
  closeMenus()
  pendingImport.value = kind
  requestAnimationFrame(() => zipInput.value?.click())
}

function toggleReplaceMenu(): void {
  if (props.disabled || busy.value) return
  const next = !replaceMenuOpen.value
  closeMenus()
  replaceMenuOpen.value = next
}

function chooseSlotFile(slot: ReplaceSlotId): void {
  if (props.disabled || busy.value) return
  replaceMenuOpen.value = false
  pendingSlot.value = slot
  requestAnimationFrame(() => slotInput.value?.click())
}

async function onSlotFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  const slot = pendingSlot.value
  input.value = ''
  pendingSlot.value = null
  if (!file || !slot || !props.parentId) return

  const current = slotFiles.value.find((item) => item.slot === slot)
  const label = current?.label ?? (slot === WORKBOOK_REPLACE_ID ? 'lesson.xlsx' : SLOT_FOLDER_LABELS[slot])
  if (
    !window.confirm(
      slot === WORKBOOK_REPLACE_ID
        ? `Replace lesson.xlsx with ${file.name}? Copy, questions, and metadata will update. Media files stay in place.`
        : `Replace ${label}${current?.filename ? ` (${current.filename})` : ''} with ${file.name}?`,
    )
  ) {
    return
  }

  replacingSlot.value = slot
  progress.value = slot === WORKBOOK_REPLACE_ID ? 'Reading lesson.xlsx…' : `Uploading ${label}…`
  error.value = null
  report.value = null
  try {
    if (slot === WORKBOOK_REPLACE_ID) {
      const result = await replaceInroadsMvpWorkbook(props.parentId, file, (message) => {
        progress.value = message
      })
      slotFiles.value = slotFiles.value.map((item) =>
        item.slot === slot ? result.file : item,
      )
      report.value = result.report
    } else {
      const result = await replaceInroadsMvpSlotFile(props.parentId, slot, file, (message) => {
        progress.value = message
      })
      slotFiles.value = slotFiles.value.map((item) => (item.slot === slot ? result : item))
    }
    await activities.load(props.parentId)
    emit('imported', props.parentId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Replace failed'
  } finally {
    replacingSlot.value = null
    progress.value = null
  }
}

function overwriteMessage(kind: ImportKind): string {
  if (kind === 'text') {
    return 'This lesson already has content. Importing the spreadsheet will overwrite copy and questions. Media files stay in place. Continue?'
  }
  if (kind === 'media') {
    return 'This lesson already has content. Importing will overwrite matching media files. Copy and questions stay in place. Continue?'
  }
  return 'This lesson already has media or questions. Importing will overwrite matching slots. Continue?'
}

async function runImport(file: File, kind: ImportKind): Promise<void> {
  if (props.disabled || busy.value) return

  importing.value = true
  progress.value = kind === 'text' ? 'Reading spreadsheet…' : 'Reading files…'
  error.value = null
  report.value = null
  try {
    if (kind === 'text' && !isWorkbookName(file.name)) {
      throw new Error('Choose a .xls or .xlsx file.')
    }

    const workbookPreview = kind === 'text' ? await parseImportWorkbook(file) : null
    const zipPayload =
      kind === 'text' ? null : await parseImportZip(file, { requireWorkbook: kind === 'package' })
    if (zipPayload && kind === 'package' && Object.keys(zipPayload.videos).length === 0) {
      const unusedVideos = zipPayload.unusedFiles.filter((name) =>
        /\.(mp4|webm|mov|m4v)$/i.test(name),
      )
      if (unusedVideos.length > 0) {
        throw new Error(
          `The zip has video files that were not in named folders: ${unusedVideos.join(', ')}.`,
        )
      }
    }

    let targetId = props.parentId ?? ''
    if (props.createLesson) {
      progress.value = 'Creating lesson…'
      const title = workbookPreview?.lesson.title.trim() || zipPayload?.lesson.title.trim() || ''
      targetId = await createBlankInroadsMvp(
        title || 'Imported Inroads MVP',
        workbookPreview?.lesson.description || zipPayload?.lesson.description || '',
      )
    } else {
      if (!targetId) throw new Error('Inroads MVP id is missing')
      const occupancy = await inspectInroadsMvpOccupancy(targetId)
      if (occupancyHasContent(occupancy) && !window.confirm(overwriteMessage(kind))) return
    }

    if (kind === 'text') {
      const result = await replaceInroadsMvpWorkbook(targetId, file, (message) => {
        progress.value = message
      })
      report.value = result.report
    } else if (zipPayload) {
      report.value = await importInroadsMvpPackage(targetId, zipPayload, (message) => {
        progress.value = message
      })
    }

    await activities.refreshList()
    if (!props.createLesson) {
      await activities.load(targetId)
    }
    await refreshSlotFiles()
    emit('imported', targetId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Import failed'
  } finally {
    importing.value = false
    progress.value = null
  }
}
</script>

<template>
  <section class="author-stack-sm inroads-import-panel">
    <p class="author-muted">
      Choose file can import a spreadsheet (.xls or .xlsx), a zip of media in the named
      folders, or a full package with both. The full package applies the workbook and those
      files together, including the full Observe page (hazard clip, details, coaching clip,
      explanation image, summary audio, and questions).
      Download template can save the workbook, a zip of empty media folders with that workbook,
      or a zip of the workbook and every media file.
    </p>
    <div class="author-actions" style="margin-top: 0">
      <div ref="importMenu" class="author-menu">
        <input
          ref="zipInput"
          type="file"
          :accept="importAccept"
          :disabled="disabled || busy"
          @change="onZip"
        />
        <AuthorPillButton
          variant="white"
          :disabled="disabled || busy"
          :aria-expanded="importMenuOpen"
          aria-haspopup="menu"
          @click="toggleImportMenu"
        >
          {{ importing ? 'Importing…' : 'Choose file' }}
        </AuthorPillButton>
        <div
          v-if="importMenuOpen"
          class="author-menu-panel inroads-import-menu"
          role="menu"
          aria-label="Choose file"
        >
          <button
            type="button"
            class="author-menu-item author-menu-item-stacked"
            role="menuitem"
            @click="chooseImport('text')"
          >
            <span>Text file</span>
            <span class="author-menu-item-subtext">.xls or .xlsx</span>
          </button>
          <button
            type="button"
            class="author-menu-item author-menu-item-stacked"
            role="menuitem"
            @click="chooseImport('media')"
          >
            <span>Media</span>
            <span class="author-menu-item-subtext">Zip without the spreadsheet</span>
          </button>
          <button
            type="button"
            class="author-menu-item author-menu-item-stacked"
            role="menuitem"
            @click="chooseImport('package')"
          >
            <span>Full package</span>
            <span class="author-menu-item-subtext">Workbook and media</span>
          </button>
        </div>
      </div>
      <div ref="downloadMenu" class="author-menu">
        <AuthorPillButton
          variant="white"
          :disabled="disabled || busy"
          :aria-expanded="downloadMenuOpen"
          aria-haspopup="menu"
          @click="toggleDownloadMenu"
        >
          {{ exporting ? 'Downloading…' : 'Download template' }}
        </AuthorPillButton>
        <div
          v-if="downloadMenuOpen"
          class="author-menu-panel inroads-download-menu"
          role="menu"
          aria-label="Download template"
        >
          <button type="button" class="author-menu-item" role="menuitem" @click="downloadTemplate('xls')">
            Download XLS
          </button>
          <button
            type="button"
            class="author-menu-item"
            role="menuitem"
            @click="downloadTemplate('folders')"
          >
            Download empty folders
          </button>
          <button
            type="button"
            class="author-menu-item author-menu-item-stacked"
            role="menuitem"
            @click="downloadTemplate('package')"
          >
            <span>Download full package</span>
            <span class="author-menu-item-subtext">All files and the XLS file</span>
          </button>
        </div>
      </div>
      <div v-if="showSlotReplace" ref="replaceMenu" class="author-menu">
        <input
          ref="slotInput"
          type="file"
          :accept="slotAccept"
          :disabled="disabled || busy"
          @change="onSlotFile"
        />
        <AuthorPillButton variant="white" :disabled="disabled || busy" @click="toggleReplaceMenu">
          {{ replacingSlot ? 'Replacing…' : 'Replace file' }}
        </AuthorPillButton>
        <div v-if="replaceMenuOpen" class="author-menu-panel inroads-replace-menu" role="menu">
          <p v-if="slotsLoading" class="inroads-replace-menu-empty">Loading files…</p>
          <p v-else-if="!slotFiles.length" class="inroads-replace-menu-empty">No slots found.</p>
          <button
            v-for="item in slotFiles"
            :key="item.slot"
            type="button"
            class="author-menu-item author-menu-item-stacked"
            role="menuitem"
            @click="chooseSlotFile(item.slot)"
          >
            <span>{{ item.label }}</span>
            <span class="author-menu-item-subtext">{{
              item.filename || 'No file yet'
            }}</span>
          </button>
        </div>
      </div>
    </div>

    <p v-if="progress" class="author-muted">{{ progress }}</p>
    <p v-if="error" class="author-error">{{ error }}</p>
    <div v-if="report" class="author-stack-sm">
      <p class="author-success">
        <template v-if="report.uploadedSlots.length">
          Imported {{ report.uploadedSlots.length }} video{{
            report.uploadedSlots.length === 1 ? '' : 's'
          }}: {{ report.uploadedSlots.map((slot) => SLOT_FOLDER_LABELS[slot]).join(', ') }}.
        </template>
        <template v-else>Updated lesson from workbook.</template>
        <template v-if="report.metadataSaved">
          Saved metadata on {{ report.metadataSaved }} file{{
            report.metadataSaved === 1 ? '' : 's'
          }}.
        </template>
      </p>
      <p v-if="report.libraryOnlySlots.length" class="author-muted">
        Coaching clips in the library (not attached to hazards yet):
        {{ report.libraryOnlySlots.join(', ') }}.
      </p>
      <p v-if="report.warnings.length" class="author-muted">
        Warnings: {{ report.warnings.join(' ') }}
      </p>
      <p v-if="report.unusedFiles.length" class="author-muted">
        Unused files: {{ report.unusedFiles.join(', ') }}
      </p>
    </div>
  </section>
</template>
