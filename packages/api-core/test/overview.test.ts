import { afterEach, describe, expect, it } from 'vitest'

import { getOverview } from '../src/index.js'
import { oneHand, openStore, storeWith } from './helpers.js'

describe('getOverview', () => {
  let store: { close(): void } | undefined
  afterEach(() => {
    store?.close()
    store = undefined
  })

  it('reports empty on a store with no hands', async () => {
    const empty = openStore()
    store = empty
    const result = await getOverview(empty, {})
    expect(result).toEqual({ empty: true, hands: 0 })
  })

  it('summarises a store with hands', async () => {
    const withHands = await storeWith(oneHand())
    store = withHands
    const result = await getOverview(withHands, {})

    expect(result.empty).toBe(false)
    if (result.empty) throw new Error('unreachable')
    expect(result.hands).toBe(1)
    expect(Array.isArray(result.metrics)).toBe(true)
    expect(result.metrics.length).toBeGreaterThan(0)
    expect(result.bankroll).toHaveLength(1)
    expect(result.bankroll[0]).toMatchObject({ index: 1 })
    expect(typeof result.bankroll[0]?.playedAt).toBe('string')
  })
})
