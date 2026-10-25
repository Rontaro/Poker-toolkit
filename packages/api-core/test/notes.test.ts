import { afterEach, describe, expect, it } from 'vitest'

import { createNote, searchNotes } from '../src/index.js'
import { oneHand, storeWith } from './helpers.js'

describe('notes', () => {
  let store: { close(): void } | undefined
  afterEach(() => {
    store?.close()
    store = undefined
  })

  it('creates a note and finds it again by a substring of its content', async () => {
    const hand = oneHand()
    const withHands = await storeWith(hand)
    store = withHands

    await createNote(withHands, {
      handId: hand.id,
      source: 'me',
      content: 'should have three-bet this spot',
      tags: ['preflop'],
    })

    const found = await searchNotes(withHands, 'three-bet')
    expect(found).toHaveLength(1)
    expect(found[0]?.handId).toBe(hand.id)
    expect(found[0]?.tags).toEqual(['preflop'])

    expect(await searchNotes(withHands, 'nothing matches this')).toEqual([])
  })
})
