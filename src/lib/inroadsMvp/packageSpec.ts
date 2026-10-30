export const WORKBOOK_EXTENSIONS = ['.xls', '.xlsx'] as const

export const WORKBOOK_REPLACE_ID = 'workbook' as const
export type WorkbookReplaceId = typeof WORKBOOK_REPLACE_ID

export const WORKBOOK_FILE_ACCEPT =
  '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const VIDEO_SLOT_IDS = [
  'preview-image',
  'intro',
  'observe-1',
  'observe-summary-audio',
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
export type ReplaceSlotId = VideoSlotId | WorkbookReplaceId

export const REQUIRED_VIDEO_SLOTS: readonly VideoSlotId[] = [
  'observe-1',
  'process-1',
  'anticipate-1',
]

export const LIBRARY_ONLY_SLOTS: readonly VideoSlotId[] = []

export const IMAGE_SLOT_IDS: readonly VideoSlotId[] = [
  'preview-image',
  'observe-explanation',
]
export const AUDIO_SLOT_IDS: readonly VideoSlotId[] = ['observe-summary-audio']

export type SlotMediaKind = 'video' | 'image' | 'audio'

export function mediaKindForSlot(slot: VideoSlotId): SlotMediaKind {
  if (IMAGE_SLOT_IDS.includes(slot)) return 'image'
  if (AUDIO_SLOT_IDS.includes(slot)) return 'audio'
  return 'video'
}

export function slotFileAccept(slot: VideoSlotId): string {
  const kind = mediaKindForSlot(slot)
  if (kind === 'image') {
    return 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif'
  }
  if (kind === 'audio') {
    return 'audio/mpeg,audio/mp4,audio/wav,audio/ogg,.mp3,.m4a,.wav,.ogg'
  }
  return 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,text/vtt,.vtt'
}

export function fileMatchesSlot(slot: VideoSlotId, file: File): boolean {
  const kind = mediaKindForSlot(slot)
  const type = file.type.toLowerCase()
  if (kind === 'image') return isImageName(file.name) || type.startsWith('image/')
  if (kind === 'audio') return isAudioName(file.name) || type.startsWith('audio/')
  return isVideoName(file.name) || type.startsWith('video/')
}

export const TEMPLATE_FOLDER_SLOT_IDS: readonly VideoSlotId[] = [
  'preview-image',
  'observe-1',
  'observe-summary-audio',
  'observe-coaching',
  'observe-explanation',
  'process-1',
  'process-2',
  'anticipate-1',
  'anticipate-2',
]

export const SHEET_NAMES = {
  lesson: 'Lesson',
  copy: 'Instructions',
  copyLegacy: 'Copy',
  questions: 'Questions',
  metadata: 'Metadata',
} as const

/** Workbook tabs that hold section | field | text copy rows. */
export const COPY_SHEET_ALIASES = [
  SHEET_NAMES.copy,
  SHEET_NAMES.copyLegacy,
  'Instruction',
] as const

export const LESSON_KEYS = [
  'title',
  'description',
  'sku',
  'intro_first_visit',
  'language',
  'button',
  'submit',
  'challenge_passed',
  'challenge_failed',
  'maneuver',
  'roadway',
  'traffic_density',
  'time_of_day',
  'road_conditions',
  'pts',
  'detection',
  'accuracy',
  'coaching',
  'q1',
  'q2',
  'q3',
  'observation',
  'process',
  'anticipation',
] as const

export const LESSON_COUNTRY_OPTIONS = [
  'Canada',
  'USA',
  'Mexico',
  'Germany',
  'France',
  'United Kingdom',
  'Italy',
  'Spain',
  'Belgium',
  'Netherlands',
  'Poland',
  'Austria',
  'Brazil',
  'Chile',
  'Czech Republic',
  'Finland',
  'Greece',
  'Hungary',
  'Luxembourg',
  'Portugal',
  'Romania',
  'Slovakia',
  'Sweden',
  'Switzerland',
  'Colombia',
  'Denmark',
  'Morocco',
  'Norway',
  'Peru',
  'Turkey',
  'Ireland',
] as const

export const LESSON_LANGUAGE_OPTIONS = ['English', 'French', 'Spanish', 'German'] as const

const COUNTRY_ALIASES: Record<string, string> = {
  'united states': 'USA',
  'united states of america': 'USA',
  usa: 'USA',
  us: 'USA',
  'u.s.': 'USA',
  'u.s.a.': 'USA',
  deutschland: 'Germany',
  france: 'France',
  fr: 'France',
  fra: 'France',
  'great britain': 'United Kingdom',
  uk: 'United Kingdom',
  gb: 'United Kingdom',
  'u.k.': 'United Kingdom',
  italy: 'Italy',
  spain: 'Spain',
  belgium: 'Belgium',
  netherlands: 'Netherlands',
  holland: 'Netherlands',
  'the netherlands': 'Netherlands',
  poland: 'Poland',
  austria: 'Austria',
  brazil: 'Brazil',
  brasil: 'Brazil',
  chile: 'Chile',
  'czech republic': 'Czech Republic',
  czechia: 'Czech Republic',
  finland: 'Finland',
  greece: 'Greece',
  hungary: 'Hungary',
  luxembourg: 'Luxembourg',
  portugal: 'Portugal',
  romania: 'Romania',
  slovakia: 'Slovakia',
  sweden: 'Sweden',
  switzerland: 'Switzerland',
  colombia: 'Colombia',
  denmark: 'Denmark',
  morocco: 'Morocco',
  norway: 'Norway',
  peru: 'Peru',
  turkey: 'Turkey',
  turkiye: 'Turkey',
  türkiye: 'Turkey',
  ireland: 'Ireland',
}

const LANGUAGE_ALIASES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
}

export function canonicalizeLessonCountry(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return COUNTRY_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

export function canonicalizeLessonLanguage(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return LANGUAGE_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

export const COPY_SECTIONS = ['observe', 'process', 'anticipate'] as const
export type CopySection = (typeof COPY_SECTIONS)[number]

export const COPY_FIELDS = [
  'instruction',
  'instruction_pill',
  'maneuver',
  'roadway',
  'traffic_density',
  'time_of_day',
  'road_conditions',
  'hazard_name',
  'core_competency',
  'hazard_explanation',
  'success_result',
  'fail_screen',
  '2_attempts',
  '3_attempts',
  'time_out',
  'missed_1_attempt',
  'missed_2_attempts',
  'missed_2_attempt',
  'no_clicks_remain',
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
  'correct_explanation',
  'show_explanation',
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
  'preview-image': 'Preview Image',
  intro: 'Intro Video',
  'observe-1': 'Observe Hazard Scenario',
  'observe-summary-audio': 'Hazard Summary Audio',
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
  const normalized = path.replace(/\\/g, '/')
  if (SKIP_PATH_PATTERN.test(normalized)) return true
  return basename(normalized).startsWith('~$')
}

export function isWorkbookName(filename: string): boolean {
  const name = basename(filename).toLowerCase()
  if (name.startsWith('~$')) return false
  return WORKBOOK_EXTENSIONS.some((ext) => name.endsWith(ext))
}

export function isVideoName(filename: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(basename(filename))
}

export function isImageName(filename: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(basename(filename))
}

export function isAudioName(filename: string): boolean {
  return /\.(mp3|m4a|wav|ogg)$/i.test(basename(filename))
}

export function isVttName(filename: string): boolean {
  return /\.vtt$/i.test(basename(filename))
}

export function isMediaName(filename: string): boolean {
  return isVideoName(filename) || isImageName(filename) || isAudioName(filename)
}

/** Video slots that may include a sibling .vtt captions file in the same folder. */
export function slotSupportsCaptions(slot: VideoSlotId): boolean {
  // Lesson/scenario clips are interactive or silent; captions belong on coaching videos.
  return (
    slot === 'observe-coaching' ||
    slot === 'process-2' ||
    slot === 'anticipate-2'
  )
}

export function captionsFileAccept(): string {
  return 'text/vtt,.vtt'
}

export function videoMimeForName(filename: string): string {
  const ext = basename(filename).split('.').pop()?.toLowerCase()
  if (ext === 'webm') return 'video/webm'
  if (ext === 'mov') return 'video/quicktime'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'm4a') return 'audio/mp4'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'ogg') return 'audio/ogg'
  if (ext === 'vtt') return 'text/vtt'
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
  if (/^preview( image)?$/.test(n)) return 'preview-image'
  if (/^intro( video)?$/.test(n)) return 'intro'
  if (/^observe explanation( image)?$/.test(n)) return 'observe-explanation'
  if (/^hazard summary audio$/.test(n)) return 'observe-summary-audio'
  if (/^observe coaching( video)?( meta)?$/.test(n)) return 'observe-coaching'
  if (/^observe( hazard)?( scenario)?$/.test(n) && n !== 'observe') {
    if (/hazard|scenario/.test(n)) return 'observe-1'
  }
  if (/^observe( video)?( 1)?$/.test(n)) return 'observe-1'
  if (/^process( coaching( video)?| video 2)$/.test(n)) return 'process-2'
  if (/^process video 3$/.test(n)) return 'process-3'
  if (/^process lesson( video)?$/.test(n)) return 'process-1'
  if (/^process( video)?( 1)?$/.test(n)) return 'process-1'
  if (/^anticipate( coaching( video)?| video 2)$/.test(n)) return 'anticipate-2'
  if (/^anticipate video 3$/.test(n)) return 'anticipate-3'
  if (/^anticipate lesson( video)?$/.test(n)) return 'anticipate-1'
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
  - optional .vtt closed-caption file in the same folder as each video

Download template is that zip with lesson.xlsx and the named folders already created.
Put one video in each folder you want filled. On import, the workbook and those videos
are applied to the builder together (Observe, Process, and Anticipate slots).
Put a .vtt next to a video (same folder; same basename preferred) to attach captions.

Folder names (case-insensitive):

  Preview Image/             (JPG, PNG, WebP, or GIF — demo tile and title screen)
  Observe Hazard Scenario/
  Hazard Summary Audio/       (MP3, M4A, WAV, or OGG — plays after the learner taps Continue)
  Observe Coaching Video/     (missed-hazard / coaching clip on Observe)
  Observe Explanation Image/  (JPG, PNG, WebP, or GIF)
  Process Lesson/
  Process Coaching Video/     (Process Video 2)
  Anticipate Lesson/
  Anticipate Coaching Video/  (Anticipate Video 2)

Required folders: none. Videos in the named folders are optional.

Workbook
--------
One sheet named "Activity text".
Columns: Screen | Element | Text | Upload text | When
Text is the source copy. Upload text is what this lesson version uses.
Mark the correct choice as "Answer A (correct)" (B, C, …).
Leave the When column as it is; it tells the importer which line is which.

Draw additional tap hazards in the Observe editor after import if needed.

Videos: .mp4, .webm, or .mov
Images: .jpg, .jpeg, .png, .webp, .gif
Audio: .mp3, .m4a, .wav, or .ogg
`
