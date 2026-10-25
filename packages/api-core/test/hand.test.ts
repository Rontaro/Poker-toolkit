import type { HandId } from '@poker/core'
import { afterEach, describe, expect, it } from 'vitest'

import { getHand } from '../src/index.js'
import { oneHand, storeWith } from './helpers.js'

describe('getHand', () => {
  let store: { close(): void } | undefined
  afterEach(() => {
    store?.close()
    store = undefined
  })

  it('fails with a 404 for a hand id that does not exist', async () => {
    const hand = oneHand()
    const withHands = await storeWith(hand)
    store = withHands

    const result = await getHand(withHands, 'does-not-exist' as HandId)
    expect(result).toEqual({ ok: false, status: 404, error: 'mano non trovata' })
  })

  it('replays a known hand with its leaks and notes', async () => {
    const hand = oneHand()
    const withHands = await storeWith(hand)
    store = withHands

    const result = await getHand(withHands, hand.id)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value.id).toBe(hand.id)
    expect(typeof result.value.replay).toBe('string')
    expect(result.value.replay.length).toBeGreaterThan(0)
    expect(Array.isArray(result.value.leaks)).toBe(true)
    expect(result.value.notes).toEqual([])
  })
})
