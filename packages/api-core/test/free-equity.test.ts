import { describe, expect, it } from 'vitest'

import { calculateFreeEquity } from '../src/index.js'

describe('calculateFreeEquity', () => {
  it('fails with a 400 when fewer than two ranges are given', () => {
    const result = calculateFreeEquity(['AA'], '', '')
    expect(result).toEqual({ ok: false, status: 400, error: 'servono almeno due range' })
  })

  it('fails with a 400 on a range that does not parse', () => {
    const result = calculateFreeEquity(['AA', 'not a range []]]'], '', '')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.status).toBe(400)
  })

  it('fails with a 400 on a board of the wrong length', () => {
    const result = calculateFreeEquity(['AA', 'KK'], 'Ah', '')
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'il board deve avere 0, 3, 4 o 5 carte',
    })
  })

  it('compares two pocket pairs with no board', () => {
    const result = calculateFreeEquity(['AA', 'KK'], '', '')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value.players).toHaveLength(2)
    expect(result.value.players[0]?.notation).toBe('AA')
    // AA dominates KK heads-up preflop.
    expect(result.value.players[0]?.equity ?? 0).toBeGreaterThan(result.value.players[1]?.equity ?? 100)
  })
})
