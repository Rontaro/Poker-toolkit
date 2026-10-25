import { describe, expect, it } from 'vitest'
import { CardFormatError, card, cards, makeHandId, rankValue, sha256Hex } from '../src/index.js'

describe('cards', () => {
  it('normalises the forms a site might print', () => {
    expect(card('Ad')).toBe('Ad')
    expect(card('ad')).toBe('Ad')
    expect(card('AD')).toBe('Ad')
    expect(card('10h')).toBe('Th')
  })

  it('parses a bracketed list', () => {
    expect(cards('6d 8d Js 8h Td')).toEqual(['6d', '8d', 'Js', '8h', 'Td'])
    expect(cards('  Ad   2d ')).toEqual(['Ad', '2d'])
    expect(cards('')).toEqual([])
  })

  it('rejects anything that is not a card', () => {
    expect(() => card('Zx')).toThrow(CardFormatError)
    expect(() => card('A')).toThrow(CardFormatError)
    expect(() => cards('Ad XX')).toThrow(CardFormatError)
  })

  it('orders ranks', () => {
    expect(rankValue(card('2c'))).toBe(0)
    expect(rankValue(card('Ac'))).toBe(12)
    expect(rankValue(card('Tc'))).toBeGreaterThan(rankValue(card('9c')))
  })
})

describe('sha256Hex', () => {
  it('matches the published vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(sha256Hex('The quick brown fox jumps over the lazy dog')).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    )
  })

  it('spans more than one block', () => {
    expect(sha256Hex('a'.repeat(1000))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    )
  })
})

describe('makeHandId', () => {
  const base = {
    site: 'pokerstars',
    siteHandId: '261973389667',
    tableName: 'Bruwer VI',
    playedAtLocal: '2026-09-04T23:29:09',
  }

  it('is stable across repeated imports', () => {
    expect(makeHandId(base)).toBe(makeHandId({ ...base }))
  })

  it('changes when any identifying field changes', () => {
    const ids = new Set([
      makeHandId(base),
      makeHandId({ ...base, site: 'winamax' }),
      makeHandId({ ...base, siteHandId: '261973389668' }),
      makeHandId({ ...base, tableName: 'Bruwer VII' }),
      makeHandId({ ...base, playedAtLocal: '2026-09-04T23:29:10' }),
    ])
    expect(ids.size).toBe(5)
  })

  it('is not the site id', () => {
    expect(makeHandId(base)).not.toContain('261973389667')
    expect(makeHandId(base)).toHaveLength(32)
  })
})
