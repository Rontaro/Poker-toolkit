import type { HandId } from '@poker/core'
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_RANGE, getHandEquity } from '../src/index.js'
import { oneHand, storeWith } from './helpers.js'

describe('getHandEquity', () => {
  let store: { close(): void } | undefined
  afterEach(() => {
    store?.close()
    store = undefined
  })

  it('fails with a 400 on a range that does not parse', async () => {
    const hand = oneHand()
    const withHands = await storeWith(hand)
    store = withHands

    const result = await getHandEquity(withHands, hand.id, 'not a range at all []]]')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.status).toBe(400)
  })

  it('fails with a 404 for a hand id that does not exist', async () => {
    const hand = oneHand()
    const withHands = await storeWith(hand)
    store = withHands

    const result = await getHandEquity(withHands, 'does-not-exist' as HandId, DEFAULT_RANGE)
    expect(result).toEqual({ ok: false, status: 404, error: 'mano non trovata' })
  })

  it("computes hero's equity street by street against the default range", async () => {
    const hand = oneHand()
    const withHands = await storeWith(hand)
    store = withHands

    const result = await getHandEquity(withHands, hand.id, DEFAULT_RANGE)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value.range).toBe(DEFAULT_RANGE)
    expect('hero' in result.value).toBe(true)
    if (!('hero' in result.value)) throw new Error('unreachable')
    expect(result.value.hero).toHaveLength(2)
    expect(result.value.streets.length).toBeGreaterThan(0)
    for (const street of result.value.streets) {
      expect(street.equity).toBeGreaterThanOrEqual(0)
      expect(street.equity).toBeLessThanOrEqual(100)
    }
  })
})
