export const MANAGING_EDITOR_NAME = 'Steven Turney'
export const APPROVER_NAME = 'Matt Latreille'

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function matchesPerson(name: string, email: string, tokens: string[]): boolean {
  const compactName = compact(name)
  const local = compact(email.split('@')[0] ?? '')
  return tokens.every((token) => compactName.includes(token) || local.includes(token))
}

export function isManagingEditor(name: string, email: string): boolean {
  return matchesPerson(name, email, ['steven', 'turney'])
}

export function isApprover(name: string, email: string): boolean {
  const local = compact(email.split('@')[0] ?? '')
  if (local === 'mlatreille' || compact(name) === 'mlatreille') return true
  return matchesPerson(name, email, ['matt', 'latreille']) || matchesPerson(name, email, ['latreille'])
}

/** Steven Turney and Matt Latreille can edit published activities and stand alone videos. */
export function canEditPublishedContent(name: string, email: string): boolean {
  return isManagingEditor(name, email) || isApprover(name, email)
}

type QueueActor = { id: string; name: string; email: string }

export type QueueHolder = { id: string; name: string }

function namedHolder(
  holder: { id?: string | null; name?: string | null } | null | undefined,
): QueueHolder | null {
  const id = holder?.id?.trim() ?? ''
  const name = holder?.name?.trim() ?? ''
  if (!id && !name) return null
  return { id, name }
}

/**
 * The person who first had the lesson in progress stays on the card when it
 * returns there from review, user acceptance, or approval. Later column holders
 * do not replace that name.
 */
export function nextQueueHolders(input: {
  fromStatus: string | undefined
  toStatus: string
  assignee: QueueHolder | null
  progressAssignee: QueueHolder | null
  actor: QueueHolder | null
}): { assignee: QueueHolder | null; progressAssignee: QueueHolder | null } {
  const progress = namedHolder(input.progressAssignee)
  const current = namedHolder(input.assignee)
  const actor = namedHolder(input.actor)
  const from = input.fromStatus ?? ''
  const to = input.toStatus

  if (to === 'available') return { assignee: null, progressAssignee: null }

  if (
    to === 'in_progress' &&
    (from === 'review' || from === 'user_acceptance' || from === 'approval' || from === 'approved')
  ) {
    const restored = progress ?? current
    return { assignee: restored, progressAssignee: progress ?? restored }
  }

  if (to === 'in_progress') {
    const assignee = from === 'in_progress' ? (current ?? actor) : actor
    return { assignee, progressAssignee: progress ?? assignee }
  }

  if (to === 'user_acceptance') {
    if (from === 'user_acceptance') {
      return { assignee: actor ?? current, progressAssignee: progress ?? current }
    }
    const remembered =
      progress ?? (from === 'in_progress' || from === 'review' ? current : null)
    return { assignee: null, progressAssignee: remembered }
  }

  const remembered =
    progress ??
    (from === 'in_progress' || from === 'review' || from === 'user_acceptance' ? current : null)
  return { assignee: current, progressAssignee: remembered }
}

/** Review stays with Steven, even when someone else submits the lesson. */
export function reviewerAssignee(actor: QueueActor): { id: string; name: string } {
  return {
    id: isManagingEditor(actor.name, actor.email) ? actor.id.trim() : '',
    name: MANAGING_EDITOR_NAME,
  }
}

/** Approval stays with Matt, even when someone else submits the lesson. */
export function approverAssignee(actor: QueueActor): { id: string; name: string } {
  return {
    id: isApprover(actor.name, actor.email) ? actor.id.trim() : '',
    name: APPROVER_NAME,
  }
}

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const words = local.split(/[._-]+/).filter(Boolean)
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}
