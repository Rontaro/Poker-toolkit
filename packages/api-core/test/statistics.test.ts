import { afterEach, describe, expect, it } from 'vitest'

import { getStatistics } from '../src/index.js'
import { oneHand, openStore, storeWith } from './helpers.js'

describe('getStatistics', () => {
  let store: { close(): void } | undefined
  afterEach(() => {
    store?.close()
    store = undefined
  })

  it('still answers with zero hands and a null profile on an empty store', async () => {
    const empty = openStore()
    store = empty
    const result = await getStatistics(empty, {})

    expect(result.hands).toBe(0)
    expect(result.profile).toBeNull()
    expect(Array.isArray(result.overall)).toBe(true)
    expect(result.byPosition).toEqual({})
  })

  it('breaks down metrics by position once there are hands', async () => {
    const withHands = await storeWith(oneHand())
    store = withHands
    const result = await getStatistics(withHands, {})

    expect(result.hands).toBe(1)
    expect(result.overall.length).toBeGreaterThan(0)
  })
})
