/**
 * Positions are derived from the button by walking the table clockwise over the
 * players actually dealt into the hand. Nothing here knows what "6-max" means:
 * seat numbers may be non-contiguous, players may be sitting out, and the same
 * code covers heads-up through 10-max.
 */

export const POSITIONS = [
  'SB',
  'BB',
  'UTG',
  'UTG1',
  'UTG2',
  'MP',
  'MP1',
  'MP2',
  'LJ',
  'HJ',
  'CO',
  'BTN',
] as const

export type Position = (typeof POSITIONS)[number]

/**
 * Names for the players between the big blind and the button, ordered from
 * first to act to last. Indexed by how many such players there are, so the
 * table encodes a *naming convention*, not a table size: at 6-max there are
 * three of them and they are called UTG/MP/CO.
 */
export type PositionNaming = readonly (readonly Position[])[]

export const DEFAULT_NAMING: PositionNaming = [
  [],
  ['CO'],
  ['MP', 'CO'],
  ['UTG', 'MP', 'CO'],
  ['UTG', 'MP', 'HJ', 'CO'],
  ['UTG', 'UTG1', 'MP', 'HJ', 'CO'],
  ['UTG', 'UTG1', 'MP1', 'MP2', 'HJ', 'CO'],
  ['UTG', 'UTG1', 'UTG2', 'MP1', 'MP2', 'HJ', 'CO'],
]

/** Fallback for tables bigger than the naming table covers. */
function generateNames(count: number): Position[] {
  const tail: Position[] = ['LJ', 'HJ', 'CO']
  const head: Position[] = []
  for (let i = 0; head.length + tail.length < count; i += 1) {
    head.push(i === 0 ? 'UTG' : (`UTG${i}` as Position))
  }
  return [...head, ...tail].slice(-count)
}

export interface PositionedSeat {
  readonly seat: number
  readonly position: Position
  /** 0 for the small blind, increasing clockwise; the button is always last. */
  readonly orderPreflop: number
}

export interface DerivePositionsInput {
  /** Seat numbers of players dealt into the hand. Order does not matter. */
  readonly seats: readonly number[]
  readonly buttonSeat: number
  readonly naming?: PositionNaming
}

/**
 * Returns one entry per dealt-in seat, in preflop action order.
 *
 * Heads-up follows the standard rule that the button posts the small blind, so
 * the two positions are BTN and BB. With three or more players the order after
 * the button is SB, BB, then everyone up to and including the button.
 *
 * A button sitting on an empty seat (a dead button, legal in tournaments) is
 * handled: the walk simply starts at the first live seat after it.
 */
export function derivePositions(input: DerivePositionsInput): PositionedSeat[] {
  const seats = [...new Set(input.seats)].sort((a, b) => a - b)
  const n = seats.length
  if (n === 0) return []
  if (n === 1) {
    return [{ seat: seats[0] as number, position: 'BTN', orderPreflop: 0 }]
  }

  const ordered = clockwiseFromButton(seats, input.buttonSeat)
  const names = n === 2 ? (['BB', 'BTN'] as Position[]) : seatNames(n, input.naming)

  return ordered.map((seat, i) => ({
    seat,
    position: names[i] as Position,
    orderPreflop: i,
  }))
}

/** Live seats ordered clockwise starting from the first one after the button. */
function clockwiseFromButton(sortedSeats: readonly number[], buttonSeat: number): number[] {
  const firstAfter = sortedSeats.findIndex((s) => s > buttonSeat)
  const start = firstAfter === -1 ? 0 : firstAfter
  return [...sortedSeats.slice(start), ...sortedSeats.slice(0, start)]
}

function seatNames(playerCount: number, naming: PositionNaming = DEFAULT_NAMING): Position[] {
  const middleCount = playerCount - 3
  const middle = naming[middleCount] ?? generateNames(middleCount)
  return ['SB', 'BB', ...middle, 'BTN']
}

/** True for positions that act after the flop with the informational edge. */
export function isLatePosition(position: Position): boolean {
  return position === 'BTN' || position === 'CO'
}

export function isBlind(position: Position): boolean {
  return position === 'SB' || position === 'BB'
}
