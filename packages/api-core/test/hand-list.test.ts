import { afterEach, describe, expect, it } from 'vitest'

import { getHandList } from '../src/index.js'
import { oneHand, openStore, storeWith } from './helpers.js'

describe('getHandList', () => {
  let store: { close(): void } | undefined
  afterEach(() => {
    store?.close()
    store = undefined
  })

  it('is empty on an empty store', async () => {
    const empty = openStore()
    store = empty
    expect(await getHandList(empty, {})).toEqual([])
  })

  it('lists hands with known hero hole cards, newest first', async () => {
    const hand = oneHand()
    const withHands = await storeWith(hand)
    store = withHands

    const result = await getHandList(withHands, {})
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe(hand.id)
    expect(result[0]?.hole.split(' ')).toHaveLength(2)
  })
})
