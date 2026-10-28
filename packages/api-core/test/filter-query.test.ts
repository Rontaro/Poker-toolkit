import { describe, expect, it } from 'vitest'

import { filterFromQuery } from '../src/index.js'

describe('filterFromQuery', () => {
  it('returns an empty filter for an empty query', () => {
    expect(filterFromQuery({})).toEqual({})
  })

  it('ignores empty strings and values that are not strings', () => {
    expect(
      filterFromQuery({
        gameType: '',
        site: ['a', 'b'],
        hero: { nested: 'x' },
        minSeats: 6,
        from: undefined,
      }),
    ).toEqual({})
  })

  it('copies site, hero and gameType through', () => {
    expect(filterFromQuery({ site: 'pokerstars', hero: 'me', gameType: 'cash' })).toEqual({
      site: 'pokerstars',
      hero: 'me',
      gameType: 'cash',
    })
  })

  it('folds minSeats/maxSeats into tableSize, each side optional', () => {
    expect(filterFromQuery({ minSeats: '6', maxSeats: '9' })).toEqual({ tableSize: { min: 6, max: 9 } })
    expect(filterFromQuery({ minSeats: '6' })).toEqual({ tableSize: { min: 6 } })
    expect(filterFromQuery({ maxSeats: '6' })).toEqual({ tableSize: { max: 6 } })
  })

  it('folds minBb/maxBb into stakes, as plain numbers', () => {
    expect(filterFromQuery({ minBb: '0.02', maxBb: '0.1' })).toEqual({ stakes: { minBb: 0.02, maxBb: 0.1 } })
    expect(filterFromQuery({ maxBb: '2' })).toEqual({ stakes: { maxBb: 2 } })
  })

  it('passes a non-numeric number through as NaN, unvalidated', () => {
    expect(filterFromQuery({ minSeats: 'six' })).toEqual({ tableSize: { min: Number.NaN } })
  })

  it('turns from/to into dates', () => {
    const filter = filterFromQuery({ from: '2026-01-01', to: '2026-02-01T10:00:00Z' })
    expect(filter.from).toEqual(new Date('2026-01-01'))
    expect(filter.to).toEqual(new Date('2026-02-01T10:00:00Z'))
  })

  it('ignores keys it does not know', () => {
    expect(filterFromQuery({ range: 'AA', q: 'x', limit: '5' })).toEqual({})
  })
})
