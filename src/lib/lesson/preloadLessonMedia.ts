import { readAnticipateDefinition } from '@/activities/anticipateDefinition'
import { readProcessDefinition } from '@/activities/processDefinition'
import { readSeeDefinition } from '@/activities/seeDefinition'
import { runPool } from '@/lib/runPool'
import { MediaWarmPool, type WarmMediaKind, type WarmMediaRequest } from '@/lib/media/warmMedia'
import type { ActivityDefinition } from '@/types/activity'
import type { LessonCompositionItemKind } from '@/types/lesson'

export type LessonWarmTarget = {
  mediaId: string
  kind: WarmMediaKind
  /** Lower plays first. 0 = first clip of each section. */
  priority: number
}

function pushTarget(
  targets: LessonWarmTarget[],
  mediaId: string | null | undefined,
  kind: WarmMediaKind,
  priority: number,
): void {
  const id = mediaId?.trim()
  if (!id) return
  if (targets.some((target) => target.mediaId === id)) return
  targets.push({ mediaId: id, kind, priority })
}

export function collectLessonWarmTargets(
  introMediaId: string | null,
  sections: Array<{ kind: LessonCompositionItemKind; definition: ActivityDefinition }>,
): LessonWarmTarget[] {
  const targets: LessonWarmTarget[] = []
  pushTarget(targets, introMediaId, 'video', 0)

  for (const section of sections) {
    if (section.kind === 'see') {
      const see = readSeeDefinition(section.definition)
      pushTarget(targets, see.media?.media_asset_id, 'video', 0)
      pushTarget(targets, see.introAudio?.media_asset_id, 'audio', 1)
      for (const hazard of see.hazards) {
        pushTarget(targets, hazard.missedVideo?.media_asset_id, 'video', 1)
        pushTarget(targets, hazard.explanationImage?.media_asset_id, 'image', 2)
        pushTarget(targets, hazard.introAudio?.media_asset_id, 'audio', 2)
      }
      continue
    }

    const segments =
      section.kind === 'process'
        ? readProcessDefinition(section.definition).segments
        : readAnticipateDefinition(section.definition).segments
    segments.forEach((segment, index) => {
      pushTarget(targets, segment.media?.media_asset_id, 'video', index === 0 ? 0 : 1)
    })
  }

  return targets.sort((a, b) => a.priority - b.priority)
}

export async function signAndWarmLessonMedia(params: {
  targets: LessonWarmTarget[]
  getSignedUrl: (mediaId: string) => Promise<string>
  pool: MediaWarmPool
  signal?: AbortSignal
  /** When false, only the opening clip blocks start. Defaults to false. */
  awaitSecondary?: boolean
}): Promise<void> {
  const { targets, getSignedUrl, pool, signal, awaitSecondary = false } = params
  if (targets.length === 0) return

  const urls = new Map<string, string>()
  await runPool(targets, 6, async (target) => {
    if (signal?.aborted) return
    try {
      urls.set(target.mediaId, await getSignedUrl(target.mediaId))
    } catch {
      /* section players still handle missing media */
    }
  })

  const requests = targets.flatMap((target) => {
    const url = urls.get(target.mediaId)
    return url ? [{ request: { url, kind: target.kind } satisfies WarmMediaRequest, priority: target.priority }] : []
  })

  const primary = requests.filter((item) => item.priority === 0)
  const rest = requests.filter((item) => item.priority !== 0)

  await runPool(primary, 2, async (item) => {
    if (signal?.aborted) return
    await pool.warm(item.request, 12_000, signal)
  })

  const warmRest = runPool(rest, 2, async (item) => {
    if (signal?.aborted) return
    await pool.warm(item.request, 8_000, signal)
  })
  if (awaitSecondary) await warmRest
}
