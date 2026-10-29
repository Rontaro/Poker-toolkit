import { afterEach, describe, expect, it } from 'vitest'

import { getTimeline } from '../src/index.js'
import { openStore, sessionHands, storeWith } from './helpers.js'

describe('getTimeline', () => {
  let store: { close(): void } | undefined
  afterEach(() => {
    store?.close()
    store = undefined
  })

  it('is well-defined on an empty store', async () => {
    const empty = openStore()
    store = empty
    const result = await getTimeline(empty, {})

    expect(result.hands).toBe(0)
    expect(result.sessions).toEqual([])
    expect(result.bankroll).toEqual([])
  })

  it('drops playedAt from the bankroll points, unlike getOverview', async () => {
    const withHands = await storeWith(...sessionHands())
    store = withHands
    const result = await getTimeline(withHands, {})

    expect(result.hands).toBeGreaterThan(0)
    expect(result.bankroll.length).toBe(result.hands)
    for (const point of result.bankroll) {
      expect(Object.keys(point).sort()).toEqual(['cumulativeBB', 'index', 'rollingBB100'])
    }
  })
})

describe('getTimeline tilt ratio', () => {
  it('is null, never absent, when there is nothing to compare against', async () => {
    const withHands = await storeWith(...sessionHands())
    try {
      const result = await getTimeline(withHands, {})
      // A short sample has no shock to measure after, so no ratio. Over JSON
      // (the Express server and the Worker both send it that way) an
      // `undefined` would vanish and the view would read the field as absent.
      expect(result.tilt.handsAfterTriggers === 0 || result.tilt.baselineLeakRate === 0).toBe(true)
      const sent = JSON.parse(JSON.stringify(result)) as { tilt: Record<string, unknown> }
      expect(sent.tilt).toHaveProperty('ratio', null)
    } finally {
      withHands.close()
    }
  })
})
