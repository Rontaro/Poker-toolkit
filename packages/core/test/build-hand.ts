/**
 * A hand builder for tests.
 *
 * `core` must not depend on a parser to be testable, and hand-built hands are
 * better than parsed ones here anyway: a test about a player being in position
 * with two limpers ahead should say exactly that, not hope a real hand history
 * happens to contain it.
 *
 * Blinds are 0.5/1, so every amount in a spec reads as big blinds.
 */

import {
  Money,
  cards as parseCards,
  derivePositions,
  type Action,
  type ActionKind,
  type Card,
  type Chips,
  type Hand,
  type HandId,
  type Seat,
  type Street,
  type StreetName,
} from '../src/index.js'

export interface SeatSpec {
  readonly seat: number
  readonly id: string
  /** Starting stack in big blinds. */
  readonly stack: number
  readonly hero?: boolean
  /** `'Ac Qc'`. */
  readonly cards?: string
  readonly sittingOut?: boolean
}

export interface StreetSpec {
  readonly name: StreetName
  /** Cards this street reveals, `'9s 7s Qh'`. */
  readonly board?: string
  /**
   * One per action: `'Hero post-sb 0.5'`, `'BTN call'`, `'Hero raise 3'`
   * (raise *to* three big blinds), `'SB fold'`, `'BB check'`, `'Hero bet 2'`,
   * `'Hero show Ac Qc'`.
   */
  readonly actions: readonly string[]
}

export interface HandSpec {
  readonly buttonSeat: number
  readonly seats: readonly SeatSpec[]
  readonly streets: readonly StreetSpec[]
  /** Chips each player collected, in big blinds. */
  readonly collected?: Readonly<Record<string, number>>
  readonly rake?: number
  readonly uncalled?: Readonly<Record<string, number>>
  readonly maxSeats?: number
}

const bb = (amount: number): Chips => Money.fromBigBlinds(amount, Money.fromDecimalString('1'))

export function buildHand(spec: HandSpec): Hand {
  const dealtIn = spec.seats.filter((s) => s.sittingOut !== true)
  const positions = new Map(
    derivePositions({
      seats: dealtIn.map((s) => s.seat),
      buttonSeat: spec.buttonSeat,
    }).map((p) => [p.seat, p.position] as const),
  )

  const seats: Seat[] = spec.seats.map((s) => {
    const position = positions.get(s.seat)
    return {
      seat: s.seat,
      playerId: s.id,
      stack: bb(s.stack),
      isHero: s.hero === true,
      sittingOut: s.sittingOut === true,
      dealtIn: s.sittingOut !== true,
      ...(position === undefined ? {} : { position }),
      ...(s.cards === undefined ? {} : { holeCards: parseCards(s.cards) }),
    }
  })

  let index = 0
  const streets: Street[] = spec.streets.map((street) => {
    const committed = new Map<string, Chips>()
    let currentBet: Chips = Money.ZERO
    const actions: Action[] = []

    for (const line of street.actions) {
      const parsed = readAction(line, committed, currentBet)
      actions.push({ ...parsed.action, index: index++, street: street.name })
      if (parsed.committedTo !== undefined) {
        committed.set(parsed.action.playerId, parsed.committedTo)
        if (parsed.committedTo > currentBet) currentBet = parsed.committedTo
      }
    }

    return {
      name: street.name,
      board: street.board === undefined ? [] : parseCards(street.board),
      actions,
    }
  })

  const net: Record<string, Chips> = {}
  for (const street of streets) {
    for (const action of street.actions) {
      net[action.playerId] = Money.sub(net[action.playerId] ?? Money.ZERO, action.contributed)
    }
  }
  for (const [id, amount] of Object.entries(spec.uncalled ?? {})) {
    net[id] = Money.add(net[id] ?? Money.ZERO, bb(amount))
  }
  for (const [id, amount] of Object.entries(spec.collected ?? {})) {
    net[id] = Money.add(net[id] ?? Money.ZERO, bb(amount))
  }

  const board: Card[] = streets.flatMap((s) => [...s.board])
  const showdown = streets
    .flatMap((s) => s.actions)
    .filter((a) => a.kind === 'show' && a.cards !== undefined)
    .map((a) => ({
      playerId: a.playerId,
      cards: a.cards as readonly Card[],
      revealed: 'shown' as const,
    }))

  return {
    id: 'test-hand' as HandId,
    source: { site: 'test', siteHandId: '1', language: 'en' },
    playedAt: new Date('2026-09-04T21:00:00Z'),
    playedAtLocal: '2026-09-04T23:00:00',
    playedAtTz: 'CET',
    game: {
      type: 'cash',
      variant: 'nlhe',
      limit: 'nl',
      stakes: { sb: bb(0.5), bb: bb(1), currency: 'EUR' },
    },
    table: {
      name: 'Test',
      maxSeats: spec.maxSeats ?? spec.seats.length,
      buttonSeat: spec.buttonSeat,
    },
    ...(spec.seats.find((s) => s.hero) === undefined
      ? {}
      : { hero: spec.seats.find((s) => s.hero)?.id as string }),
    seats,
    streets,
    results: {
      pots: Object.entries(spec.collected ?? {}).map(([id, amount], i) => ({
        kind: 'main' as const,
        index: i,
        amount: bb(amount),
        winners: [id],
      })),
      rake: bb(spec.rake ?? 0),
      totalPot: Money.sum(streets.flatMap((s) => s.actions.map((a) => a.contributed))),
      uncalledReturns: Object.entries(spec.uncalled ?? {}).map(([id, amount]) => ({
        playerId: id,
        amount: bb(amount),
      })),
      showdown,
      net,
    },
    ...(board.length === 0 ? {} : {}),
  }
}

interface ReadResult {
  action: Omit<Action, 'index' | 'street'>
  /** New total street commitment, when the action moved chips. */
  committedTo?: Chips
}

function readAction(
  line: string,
  committed: ReadonlyMap<string, Chips>,
  currentBet: Chips,
): ReadResult {
  const [playerId, verb, ...rest] = line.trim().split(/\s+/)
  if (playerId === undefined || verb === undefined) throw new Error(`Cannot read action: ${line}`)

  const already = committed.get(playerId) ?? Money.ZERO
  const allIn = rest.at(-1) === 'all-in'
  const args = allIn ? rest.slice(0, -1) : rest
  // `show` carries cards rather than an amount, so only read a number when
  // the first argument actually is one.
  const first = args[0]
  const value = first === undefined || !/^[\d.]+$/.test(first) ? undefined : bb(Number(first))

  const base = { playerId, isAllIn: allIn }

  switch (verb as ActionKind | 'raise' | 'call') {
    case 'post-sb':
    case 'post-bb':
    case 'post-dead':
    case 'straddle': {
      const amount = value ?? Money.ZERO
      return {
        action: { ...base, kind: verb as ActionKind, amount, contributed: amount },
        committedTo: Money.add(already, amount),
      }
    }
    case 'post-ante': {
      const amount = value ?? Money.ZERO
      // Antes are dead money and never count towards the current bet.
      return { action: { ...base, kind: 'post-ante', amount, contributed: amount } }
    }
    case 'bet': {
      const amount = value ?? Money.ZERO
      return {
        action: { ...base, kind: 'bet', amount, contributed: amount },
        committedTo: Money.add(already, amount),
      }
    }
    case 'raise': {
      const to = value ?? Money.ZERO
      return {
        action: {
          ...base,
          kind: 'raise',
          amount: Money.sub(to, currentBet),
          toAmount: to,
          contributed: Money.sub(to, already),
        },
        committedTo: to,
      }
    }
    case 'call': {
      const amount = value ?? Money.sub(currentBet, already)
      return {
        action: { ...base, kind: 'call', amount, contributed: amount },
        committedTo: Money.add(already, amount),
      }
    }
    case 'check':
      return { action: { ...base, kind: 'check', contributed: Money.ZERO } }
    case 'fold':
      return { action: { ...base, kind: 'fold', contributed: Money.ZERO } }
    case 'show':
      return {
        action: {
          ...base,
          kind: 'show',
          contributed: Money.ZERO,
          cards: parseCards(args.join(' ')),
        },
      }
    default:
      throw new Error(`Unknown verb ${verb} in ${JSON.stringify(line)}`)
  }
}
