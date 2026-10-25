import { afterEach, describe, expect, it } from 'vitest'

import { getLeaks } from '../src/index.js'
import { openStore, sessionHands, storeWith } from './helpers.js'

describe('getLeaks', () => {
  let store: { close(): void } | undefined
  afterEach(() => {
    store?.close()
    store = undefined
  })

  it('lists every rule even with no hands to check them against', async () => {
    const empty = openStore()
    store = empty
    const result = await getLeaks(empty, {})

    expect(result.rules.length).toBeGreaterThan(0)
    expect(result.byRule).toEqual([])
    expect(result.events).toEqual([])
  })

  it('attaches playedAt/position/netBB to events found in a real session', async () => {
    const withHands = await storeWith(...sessionHands())
    store = withHands
    const result = await getLeaks(withHands, {})

    for (const event of result.events) {
      expect(typeof event.netBB).toBe('number')
      expect(event.playedAt === null || typeof event.playedAt === 'string').toBe(true)
    }
  })
})
