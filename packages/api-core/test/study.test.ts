import { afterEach, describe, expect, it } from 'vitest'

import { getStudyOptions, runStudy } from '../src/index.js'
import { oneHand, openStore, storeWith } from './helpers.js'

describe('getStudyOptions', () => {
  it('lists selectors, presets and rules with no store needed', () => {
    const options = getStudyOptions()
    expect(options.selectors.length).toBeGreaterThan(0)
    expect(options.presets.length).toBeGreaterThan(0)
    expect(options.rules.length).toBeGreaterThan(0)
  })
})

describe('runStudy', () => {
  let store: { close(): void } | undefined
  afterEach(() => {
    store?.close()
    store = undefined
  })

  it('fails with a 400 when the filter matches no hands', async () => {
    const empty = openStore()
    store = empty

    const result = await runStudy(empty, { filter: {} })
    expect(result).toEqual({ ok: false, status: 400, error: 'nessuna mano per questo filtro' })
  })

  it('builds a prompt from explicit hand ids even outside the filter', async () => {
    const hand = oneHand()
    const withHands = await storeWith(hand)
    store = withHands

    const result = await runStudy(withHands, { filter: {}, handIds: [hand.id] })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(typeof result.value.text).toBe('string')
    expect(result.value.text.length).toBe(result.value.characters)
  })
})
