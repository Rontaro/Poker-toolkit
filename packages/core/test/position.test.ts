import { describe, expect, it } from 'vitest'
import { derivePositions, type Position } from '../src/index.js'

function positions(seats: number[], buttonSeat: number): Record<number, Position> {
  const out: Record<number, Position> = {}
  for (const entry of derivePositions({ seats, buttonSeat })) out[entry.seat] = entry.position
  return out
}

describe('derivePositions', () => {
  it('walks clockwise from the button at a full 6-max table', () => {
    expect(positions([1, 2, 3, 4, 5, 6], 6)).toEqual({
      1: 'SB',
      2: 'BB',
      3: 'UTG',
      4: 'MP',
      5: 'CO',
      6: 'BTN',
    })
  })

  it('wraps around when the button is not the highest seat', () => {
    expect(positions([1, 2, 3, 4, 5, 6], 3)).toEqual({
      4: 'SB',
      5: 'BB',
      6: 'UTG',
      1: 'MP',
      2: 'CO',
      3: 'BTN',
    })
  })

  it('ignores the gap left by a player who is not dealt in', () => {
    // Seat 5 sat out, so the five remaining players shift up a position each.
    expect(positions([1, 2, 3, 4, 6], 4)).toEqual({
      6: 'SB',
      1: 'BB',
      2: 'MP',
      3: 'CO',
      4: 'BTN',
    })
  })

  it('gives the button the small blind heads-up', () => {
    expect(positions([1, 2], 1)).toEqual({ 1: 'BTN', 2: 'BB' })
    expect(positions([3, 7], 7)).toEqual({ 7: 'BTN', 3: 'BB' })
  })

  it('has no middle positions three-handed', () => {
    expect(positions([2, 4, 6], 2)).toEqual({ 4: 'SB', 6: 'BB', 2: 'BTN' })
  })

  it('names a full 9-max table', () => {
    expect(positions([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toEqual({
      4: 'SB',
      5: 'BB',
      6: 'UTG',
      7: 'UTG1',
      8: 'MP1',
      9: 'MP2',
      1: 'HJ',
      2: 'CO',
      3: 'BTN',
    })
  })

  it('handles a button sitting on an empty seat', () => {
    // A dead button is legal in tournaments: the walk simply starts at the
    // first live seat after it.
    expect(positions([1, 2, 4, 5], 3)).toEqual({ 4: 'SB', 5: 'BB', 1: 'CO', 2: 'BTN' })
  })

  it('returns preflop action order', () => {
    const order = derivePositions({ seats: [1, 2, 3, 4, 5, 6], buttonSeat: 6 })
    expect(order.map((p) => p.position)).toEqual(['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN'])
    expect(order.map((p) => p.orderPreflop)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('copes with degenerate input instead of throwing', () => {
    expect(derivePositions({ seats: [], buttonSeat: 1 })).toEqual([])
    expect(positions([4], 4)).toEqual({ 4: 'BTN' })
  })
})
