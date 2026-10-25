import { describe, expect, it } from 'vitest'
import { card } from '@poker/core'
import { ALL_COMBO_COUNT, combosOf, comboOf, formatRange, parseRange } from '../src/range.js'

function expandOk(notation: string): string[] {
  const result = parseRange(notation)
  if (!result.ok) throw new Error(`expected ok, got errors: ${JSON.stringify(result.errors)}`)
  return combosOf(result.value)
}

describe('parseRange combo counts', () => {
  it('AA -> 6 combos', () => expect(expandOk('AA')).toHaveLength(6))
  it('AKs -> 4 combos', () => expect(expandOk('AKs')).toHaveLength(4))
  it('AKo -> 12 combos', () => expect(expandOk('AKo')).toHaveLength(12))
  it('AK -> 16 combos (suited + offsuit)', () => expect(expandOk('AK')).toHaveLength(16))
  it('random -> 1326 combos', () => {
    expect(expandOk('random')).toHaveLength(ALL_COMBO_COUNT)
    expect(expandOk('any2')).toHaveLength(ALL_COMBO_COUNT)
  })
})

describe('parseRange modifiers', () => {
  it('77+ expands to 77 through AA', () => {
    // 8 ranks (7,8,9,T,J,Q,K,A) x 6 combos each
    expect(expandOk('77+')).toHaveLength(8 * 6)
  })

  it('88-JJ expands to 88, 99, TT, JJ', () => {
    expect(expandOk('88-JJ')).toHaveLength(4 * 6)
  })

  it('ATs+ expands to ATs, AJs, AQs, AKs', () => {
    expect(expandOk('ATs+')).toHaveLength(4 * 4)
  })

  it('KTo+ expands to KTo, KJo, KQo', () => {
    expect(expandOk('KTo+')).toHaveLength(3 * 12)
  })

  it('76s-T9s expands to 76s, 87s, 98s, T9s (constant-gap connectors)', () => {
    expect(expandOk('76s-T9s')).toHaveLength(4 * 4)
  })

  it('reversed range endpoints still work (JJ-88 same as 88-JJ)', () => {
    expect(expandOk('JJ-88')).toHaveLength(4 * 6)
  })
})

describe('parseRange combos and lists', () => {
  it('parses an explicit combo', () => {
    const combos = expandOk('AhKd')
    expect(combos).toEqual([comboOf(card('Ah'), card('Kd'))])
  })

  it('parses a bracketed list of explicit combos', () => {
    const combos = expandOk('[AhKd, 7c7d]')
    expect(combos.sort()).toEqual([comboOf(card('7c'), card('7d')), comboOf(card('Ah'), card('Kd'))].sort())
  })

  it('accepts comma and space separated tokens together', () => {
    expect(expandOk('AA, KK QQ')).toHaveLength(18)
  })

  it('same combo typed twice is a duplicate warning, not an error', () => {
    const result = parseRange('AhKd, AhKd')
    if (!result.ok) throw new Error('expected ok')
    expect(result.value.combos.size).toBe(1)
    expect(result.warnings.some((w) => w.code === 'duplicate-combo')).toBe(true)
  })
})

describe('parseRange failure modes', () => {
  it('never throws on garbage input', () => {
    expect(() => parseRange('XYZ not a range :: 99++')).not.toThrow()
  })

  it('collects an error for an unrecognised token', () => {
    const result = parseRange('AA, XYZ, KK')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'unknown-token')).toBe(true)
  })

  it('collects multiple errors across several bad tokens rather than stopping at the first', () => {
    const result = parseRange('XYZ, ZZQ, AA')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })

  it('rejects incompatible shapes in a range expression', () => {
    const result = parseRange('AKs-KQo')
    expect(result.ok).toBe(false)
  })

  it('reports an unterminated bracket', () => {
    const result = parseRange('[AhKd')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'unterminated-bracket')).toBe(true)
  })

  it('empty input fails rather than silently producing an empty range', () => {
    expect(parseRange('   ').ok).toBe(false)
  })
})

describe('formatRange round trips', () => {
  const cases = ['AA', 'AKs', 'AKo', 'AK', '77+', '88-JJ', 'ATs+', 'KTo+', 'random']

  for (const notation of cases) {
    it(`round trips ${notation}`, () => {
      const parsed = parseRange(notation)
      if (!parsed.ok) throw new Error('expected ok')
      expect(formatRange(parsed.value)).toBe(notation)
    })
  }

  it('formats an explicit combo as itself', () => {
    const parsed = parseRange('AhKd')
    if (!parsed.ok) throw new Error('expected ok')
    expect(formatRange(parsed.value)).toBe('AhKd')
  })

  it('formats a connector range as its constituent shapes (documented limitation)', () => {
    const parsed = parseRange('76s-T9s')
    if (!parsed.ok) throw new Error('expected ok')
    expect(formatRange(parsed.value)).toBe('76s, 87s, 98s, T9s')
  })
})
