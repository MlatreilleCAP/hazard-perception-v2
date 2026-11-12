import { describe, expect, it } from 'vitest'
import { parseWebVtt } from '@/lib/media/captions'

describe('parseWebVtt', () => {
  it('ignores line breaks inside a cue', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.300
En vous glissant dans la voie voisine à
votre vitesse
actuelle,
`
    expect(parseWebVtt(vtt)).toEqual([
      {
        start: 0,
        end: 2.3,
        text: 'En vous glissant dans la voie voisine à votre vitesse actuelle,',
      },
    ])
  })
})
