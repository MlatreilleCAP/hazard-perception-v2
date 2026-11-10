import { describe, expect, it } from 'vitest'
import { nextQueueHolders } from '@/lib/lesson/queueAssignment'

const eric = { id: 'eric', name: 'Eric Ball' }
const matt = { id: 'matt', name: 'Matt Latreille' }

describe('nextQueueHolders', () => {
  it('remembers the person who claims a lesson', () => {
    expect(
      nextQueueHolders({
        fromStatus: 'available',
        toStatus: 'in_progress',
        assignee: null,
        progressAssignee: null,
        actor: eric,
      }),
    ).toEqual({ assignee: eric, progressAssignee: eric })
  })

  it('keeps that name when the lesson moves through review and approval', () => {
    const claimed = nextQueueHolders({
      fromStatus: 'available',
      toStatus: 'in_progress',
      assignee: null,
      progressAssignee: null,
      actor: eric,
    })
    const reviewed = nextQueueHolders({
      fromStatus: 'in_progress',
      toStatus: 'review',
      assignee: claimed.assignee,
      progressAssignee: claimed.progressAssignee,
      actor: matt,
    })
    const approved = nextQueueHolders({
      fromStatus: 'review',
      toStatus: 'approval',
      assignee: reviewed.assignee,
      progressAssignee: reviewed.progressAssignee,
      actor: matt,
    })

    expect(reviewed.progressAssignee).toEqual(eric)
    expect(approved.progressAssignee).toEqual(eric)
    expect(approved.assignee).toEqual(eric)
  })

  it('keeps that name through user acceptance', () => {
    const claimed = nextQueueHolders({
      fromStatus: 'available',
      toStatus: 'in_progress',
      assignee: null,
      progressAssignee: null,
      actor: eric,
    })
    const reviewed = nextQueueHolders({
      fromStatus: 'in_progress',
      toStatus: 'review',
      assignee: claimed.assignee,
      progressAssignee: claimed.progressAssignee,
      actor: matt,
    })
    const acceptance = nextQueueHolders({
      fromStatus: 'review',
      toStatus: 'user_acceptance',
      assignee: reviewed.assignee,
      progressAssignee: reviewed.progressAssignee,
      actor: matt,
    })

    expect(acceptance.assignee).toBeNull()
    expect(acceptance.progressAssignee).toEqual(eric)
  })

  it('assigns a user acceptance lesson to the person who claims it', () => {
    expect(
      nextQueueHolders({
        fromStatus: 'user_acceptance',
        toStatus: 'user_acceptance',
        assignee: null,
        progressAssignee: eric,
        actor: { id: 'casey', name: 'Casey Quinn' },
      }),
    ).toEqual({
      assignee: { id: 'casey', name: 'Casey Quinn' },
      progressAssignee: eric,
    })
  })

  it('restores the original in-progress name when the lesson is sent back', () => {
    expect(
      nextQueueHolders({
        fromStatus: 'approval',
        toStatus: 'in_progress',
        assignee: { id: '', name: 'Matt Latreille' },
        progressAssignee: eric,
        actor: matt,
      }),
    ).toEqual({ assignee: eric, progressAssignee: eric })
  })

  it('uses the review holder when an older lesson has no remembered name yet', () => {
    expect(
      nextQueueHolders({
        fromStatus: 'review',
        toStatus: 'in_progress',
        assignee: { id: 'brad', name: 'Brad Ball' },
        progressAssignee: null,
        actor: matt,
      }).assignee,
    ).toEqual({ id: 'brad', name: 'Brad Ball' })
  })
})
