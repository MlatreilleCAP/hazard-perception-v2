import { createAnticipateActivity } from '@/activities/createAnticipateActivity'
import { createInroadsMvpActivity } from '@/activities/createInroadsMvpActivity'
import { createProcessActivity } from '@/activities/createProcessActivity'
import { createSeeActivity } from '@/activities/createSeeActivity'
import { readAnticipateDefinition, writeAnticipateDefinition } from '@/activities/anticipateDefinition'
import {
  readInroadsMvpDefinition,
  writeInroadsMvpDefinition,
} from '@/activities/inroadsMvpDefinition'
import { readProcessDefinition, writeProcessDefinition } from '@/activities/processDefinition'
import { readSeeDefinition, writeSeeDefinition } from '@/activities/seeDefinition'
import { services } from '@/app/container'
import { INROADS_MVP_CHILD_TAG } from '@/types/inroadsMvp'
import type { ActivityDefinition } from '@/types/activity'

export async function createBlankInroadsMvp(
  title: string,
  description = '',
): Promise<string> {
  const base = title.trim() || 'Inroads MVP'

  const see = createSeeActivity(`${base} · Observe`)
  see.metadata.tags = [...see.metadata.tags, INROADS_MVP_CHILD_TAG]
  const savedSee = await services.persistence.save(see)

  const process = createProcessActivity(`${base} · Process`)
  process.metadata.tags = [...process.metadata.tags, INROADS_MVP_CHILD_TAG]
  const savedProcess = await services.persistence.save(process)

  const anticipate = createAnticipateActivity(`${base} · Anticipate`)
  anticipate.metadata.tags = [...anticipate.metadata.tags, INROADS_MVP_CHILD_TAG]
  const savedAnticipate = await services.persistence.save(anticipate)

  const mvp = createInroadsMvpActivity(base, savedSee.id, savedProcess.id, savedAnticipate.id)
  mvp.metadata.description = description.trim()
  const saved = await services.persistence.save(mvp)
  return saved.id
}

export async function duplicateInroadsMvpVersion(sourceId: string): Promise<string> {
  const parent = await loadActivityOrThrow(sourceId)
  const mvp = readInroadsMvpDefinition(parent)
  if (!mvp) throw new Error('Inroads MVP definition was not found')

  const base = parent.metadata.title.trim() || 'Inroads MVP'
  const seeSource = readSeeDefinition(await loadActivityOrThrow(mvp.seeActivityId))
  const processSource = readProcessDefinition(await loadActivityOrThrow(mvp.processActivityId))
  const anticipateSource = readAnticipateDefinition(
    await loadActivityOrThrow(mvp.anticipateActivityId),
  )

  const see = createSeeActivity(`${base} · Observe`)
  see.metadata.tags = [...see.metadata.tags, INROADS_MVP_CHILD_TAG]
  const savedSee = await services.persistence.save(writeSeeDefinition(see, seeSource))

  const process = createProcessActivity(`${base} · Process`)
  process.metadata.tags = [...process.metadata.tags, INROADS_MVP_CHILD_TAG]
  const savedProcess = await services.persistence.save(
    writeProcessDefinition(process, processSource),
  )

  const anticipate = createAnticipateActivity(`${base} · Anticipate`)
  anticipate.metadata.tags = [...anticipate.metadata.tags, INROADS_MVP_CHILD_TAG]
  const savedAnticipate = await services.persistence.save(
    writeAnticipateDefinition(anticipate, anticipateSource),
  )

  const copy = createInroadsMvpActivity(base, savedSee.id, savedProcess.id, savedAnticipate.id)
  copy.metadata.description = parent.metadata.description
  const next = writeInroadsMvpDefinition(copy, {
    ...mvp,
    country: '',
    language: '',
    seeActivityId: savedSee.id,
    processActivityId: savedProcess.id,
    anticipateActivityId: savedAnticipate.id,
  })
  const saved = await services.persistence.save(next)
  return saved.id
}

export async function loadActivityOrThrow(id: string): Promise<ActivityDefinition> {
  const activity = await services.persistence.getById(id)
  if (!activity) throw new Error(`Activity ${id} was not found`)
  return activity
}
