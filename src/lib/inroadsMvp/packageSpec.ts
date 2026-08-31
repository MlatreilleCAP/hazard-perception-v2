export const WORKBOOK_EXTENSIONS = ['.xls', '.xlsx'] as const

export const VIDEO_SLOT_IDS = [
  'intro',
  'observe-1',
  'observe-coaching',
  'observe-explanation',
  'process-1',
  'process-2',
  'process-3',
  'anticipate-1',
  'anticipate-2',
  'anticipate-3',
] as const

export type VideoSlotId = (typeof VIDEO_SLOT_IDS)[number]

export const REQUIRED_VIDEO_SLOTS: readonly VideoSlotId[] = [
  'observe-1',
  'process-1',
  'anticipate-1',
]

export const LIBRARY_ONLY_SLOTS: readonly VideoSlotId[] = []

export const IMAGE_SLOT_IDS: readonly VideoSlotId[] = ['observe-explanation']

export const TEMPLATE_FOLDER_SLOT_IDS: readonly VideoSlotId[] = [
  'intro',
  'observe-1',
  'observe-coaching',
  'observe-explanation',
  'process-1',
  'process-2',
  'anticipate-1',
  'anticipate-2',
]

export const SHEET_NAMES = {
  lesson: 'Lesson',
  copy: 'Copy',
  questions: 'Questions',
} as const

export const LESSON_KEYS = ['title', 'description', 'intro_first_visit'] as const

export const COPY_SECTIONS = ['observe', 'process', 'anticipate'] as const
export type CopySection = (typeof COPY_SECTIONS)[number]

export const COPY_FIELDS = [
  'instruction',
  'instruction_pill',
  'hazard_name',
  'core_competency',
  'hazard_explanation',
  'second_instruction',
  'second_instruction_pill',
  'second_score_threshold',
] as const
export type CopyField = (typeof COPY_FIELDS)[number]

export const QUESTION_KIND_VALUES = ['severity', 'theory'] as const
export const QUESTION_SECTIONS = ['observe', 'process', 'anticipate'] as const
export const ANSWER_COLUMNS = ['a', 'b', 'c', 'd', 'e', 'f'] as const

export const QUESTION_HEADERS = [
  'section',
  'segment',
  'kind',
  'question_text',
  'explanation',
  'show_explanation',
  'show_correct_incorrect',
  'correct',
  'a_text',
  'a_points',
  'b_text',
  'b_points',
  'c_text',
  'c_points',
  'd_text',
  'd_points',
  'e_text',
  'e_points',
  'f_text',
  'f_points',
] as const

export const HIDDEN_QUESTION_HEADERS = [
  'segment',
  'show_explanation',
  'show_correct_incorrect',
  'a_points',
  'b_points',
  'c_points',
  'd_text',
  'd_points',
  'e_text',
  'e_points',
  'f_text',
  'f_points',
] as const

const SKIP_PATH_PATTERN = /(^|\/)(\.|__macosx)/i

export const SLOT_FOLDER_LABELS: Record<VideoSlotId, string> = {
  intro: 'Intro Video',
  'observe-1': 'Observe Hazard Scenario',
  'observe-coaching': 'Observe Coaching Video',
  'observe-explanation': 'Observe Explanation Image',
  'process-1': 'Process Lesson',
  'process-2': 'Process Coaching Video',
  'process-3': 'Process Video 3',
  'anticipate-1': 'Anticipate Lesson',
  'anticipate-2': 'Anticipate Coaching Video',
  'anticipate-3': 'Anticipate Video 3',
}

export function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function parentFolderName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length < 2) return ''
  return parts[parts.length - 2] ?? ''
}

export function shouldIgnoreZipPath(path: string): boolean {
  return SKIP_PATH_PATTERN.test(path.replace(/\\/g, '/'))
}

export function isWorkbookName(filename: string): boolean {
  const name = basename(filename).toLowerCase()
  return WORKBOOK_EXTENSIONS.some((ext) => name.endsWith(ext))
}

export function isVideoName(filename: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(basename(filename))
}

export function isImageName(filename: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(basename(filename))
}

export function isMediaName(filename: string): boolean {
  return isVideoName(filename) || isImageName(filename)
}

export function videoMimeForName(filename: string): string {
  const ext = basename(filename).split('.').pop()?.toLowerCase()
  if (ext === 'webm') return 'video/webm'
  if (ext === 'mov') return 'video/quicktime'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return 'video/mp4'
}

export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Map a folder or file label such as "Observe Coaching Video" to a slot. */
export function matchMediaSlot(label: string): VideoSlotId | null {
  const n = normalizeLabel(label)
  if (!n) return null
  for (const slot of VIDEO_SLOT_IDS) {
    if (normalizeLabel(SLOT_FOLDER_LABELS[slot]) === n) return slot
  }
  if (/^intro( video)?$/.test(n)) return 'intro'
  if (/^observe explanation( image)?$/.test(n)) return 'observe-explanation'
  if (/^observe coaching( video)?$/.test(n)) return 'observe-coaching'
  if (/^observe( hazard)?( scenario)?$/.test(n) && n !== 'observe') {
    if (/hazard|scenario/.test(n)) return 'observe-1'
  }
  if (/^observe( video)?( 1)?$/.test(n)) return 'observe-1'
  if (/^process( coaching( video)?| video 2)$/.test(n)) return 'process-2'
  if (/^process video 3$/.test(n)) return 'process-3'
  if (/^process lesson$/.test(n)) return 'process-1'
  if (/^process( video)?( 1)?$/.test(n)) return 'process-1'
  if (/^anticipate( coaching( video)?| video 2)$/.test(n)) return 'anticipate-2'
  if (/^anticipate video 3$/.test(n)) return 'anticipate-3'
  if (/^anticipate lesson$/.test(n)) return 'anticipate-1'
  if (/^anticipate( video)?( 1)?$/.test(n)) return 'anticipate-1'
  return null
}

/** Prefer a named folder in the path; fall back to the file name (e.g. Intro Video.mp4). */
export function matchMediaSlotFromPath(path: string): VideoSlotId | null {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  for (let i = parts.length - 2; i >= 0; i--) {
    const slot = matchMediaSlot(parts[i] ?? '')
    if (slot) return slot
  }
  const file = parts[parts.length - 1]
  return file ? matchMediaSlot(file) : null
}

export const IMPORT_README = `Inroads MVP import
==================

Upload one zip that contains:
  - lesson.xls or lesson.xlsx (workbook)
  - one video per named folder (the folder name is how the system places the file)

Download template is that zip with lesson.xlsx and the named folders already created.
Put one video in each folder you want filled. On import, the workbook and those videos
are applied to the builder together (intro, Observe, Process, Anticipate slots).

Folder names (case-insensitive):

  Intro Video/
  Observe Hazard Scenario/
  Observe Coaching Video/     (missed-hazard / coaching clip on Observe)
  Observe Explanation Image/  (JPG, PNG, WebP, or GIF)
  Process Lesson/
  Process Coaching Video/     (Process Video 2)
  Anticipate Lesson/
  Anticipate Coaching Video/  (Anticipate Video 2)

Required folders: none. Videos in the named folders are optional.

Workbook sheets
---------------
Lesson: column A = key, column B = value
  title
  description
  intro_first_visit     true or false

Copy: header row, then section | field | text
  section: observe | process | anticipate
  field: instruction | instruction_pill | second_instruction |
         second_instruction_pill | second_score_threshold
  Observe also uses: hazard_name | core_competency | hazard_explanation
  Observe instruction / instruction_pill = scenario overlay on the hazard clip
  Observe second_instruction / second_instruction_pill = coaching clip overlay
  core_competency: Attitude | Speed Management | Space Management |
                   Danger Zones | Scanning | Other Motorists

Questions: one row per Observe, Process, or Anticipate question
  Visible: section | kind | question_text | explanation | correct | a_text | b_text | c_text
  Hidden/locked: segment, show_explanation, show_correct_incorrect,
                 a–c points, and D–F answers
  section: observe | process | anticipate
  kind: severity | theory
  correct: A-C
  Correct answers are always worth 10 points.
  Observe questions attach to the first Observe hazard.

Lesson intro_first_visit and Copy second_score_threshold rows are hidden and locked.

Draw additional tap hazards in the Observe editor after import if needed.

Videos: .mp4, .webm, or .mov
Images: .jpg, .jpeg, .png, .webp, .gif
`
