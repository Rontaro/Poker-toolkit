import {
  IssueLog,
  Money,
  cards as parseCards,
  derivePositions,
  fail,
  makeHandId,
  ok,
  type Action,
  type ActionKind,
  type Card,
  type Chips,
  type Hand,
  type HandResults,
  type ParseOptions,
  type ParseResult,
  type Pot,
  type Position,
  type Seat,
  type Showdown,
  type Street,
  type StreetName,
} from '@poker/core'

import { normaliseNewlines } from './encoding.js'
import { grammarFor, type Grammar } from './grammar.js'
import type { PokerStarsLocale } from './locale.js'
import { parseHeaderLine } from './parse-header.js'
import { matchAny } from './template.js'

export const SITE_ID = 'pokerstars'

interface SeatDraft {
  seat: number
  playerId: string
  stack: Chips
  sittingOut: boolean
  bounty?: Chips
  holeCards?: Card[]
  acted: boolean
}

interface StreetDraft {
  name: StreetName
  board: Card[]
  actions: Action[]
}

interface CollectedDraft {
  playerId: string
  amount: Chips
  kind: 'main' | 'side'
  index: number
}

const BRACKETS = /\[([^\]]*)\]/g
const PLAYER_ACTION = /^(?<player>.+?): (?<rest>.*)$/
const SUMMARY_POSITION = /^\s*\(([^)]*)\)/

/**
 * Parses one hand. Never throws: anything it cannot make sense of comes back
 * as a `ParseFailure` carrying the original text, so the caller can quarantine
 * the hand and keep importing the rest of the file.
 */
export function parseHand(
  raw: string,
  locale: PokerStarsLocale,
  options: ParseOptions = {},
): ParseResult<Hand> {
  const log = new IssueLog()
  try {
    const hand = build(raw, locale, log, options)
    if (hand === undefined || log.hasErrors) return fail(raw, log.errors, log.warnings)
    return ok(hand, log.warnings)
  } catch (cause) {
    log.fail('unexpected', `Unhandled parser error: ${(cause as Error).message}`)
    return fail(raw, log.errors, log.warnings)
  }
}

function build(
  raw: string,
  locale: PokerStarsLocale,
  log: IssueLog,
  options: ParseOptions,
): Hand | undefined {
  const grammar = grammarFor(locale)
  const lines = normaliseNewlines(raw).split('\n').map((l) => l.trim())
  const first = lines[0]
  if (first === undefined || first === '') {
    log.fail('empty', 'Empty hand text')
    return undefined
  }

  const header = parseHeaderLine(first, locale, log)
  if (header === undefined) {
    if (!log.hasErrors) log.fail('not-a-hand', 'First line is not a PokerStars header', { line: 1 })
    return undefined
  }

  const table = readTable(lines, grammar, log)
  if (table === undefined) return undefined

  const seats = new Map<number, SeatDraft>()
  const byPlayer = new Map<string, SeatDraft>()
  let cursor = table.nextLine

  for (; cursor < lines.length; cursor += 1) {
    const draft = readSeat(lines[cursor] as string, grammar, locale, log, cursor + 1)
    if (draft === undefined) break
    seats.set(draft.seat, draft)
    byPlayer.set(draft.playerId, draft)
  }

  if (seats.size === 0) {
    log.fail('no-seats', 'Hand lists no seats')
    return undefined
  }

  const body = readBody(lines, cursor, grammar, locale, log, byPlayer, header.game.stakes.bb)
  const summary = readSummary(lines, body.summaryLine, grammar, locale, log, seats)

  return assemble({
    raw,
    options,
    locale,
    log,
    header,
    table,
    seats,
    byPlayer,
    body,
    summary,
  })
}

interface TableInfo {
  name: string
  maxSeats: number
  buttonSeat: number
  nextLine: number
}

function readTable(lines: readonly string[], grammar: Grammar, log: IssueLog): TableInfo | undefined {
  const line = lines[1]
  if (line === undefined) {
    log.fail('no-table', 'Hand has no table line')
    return undefined
  }
  const groups = matchAny(grammar.table, line)
  if (groups === undefined) {
    log.fail('no-table', 'Cannot read the table line', { line: 2, text: line })
    return undefined
  }
  return {
    name: groups['name'] ?? '',
    maxSeats: Number(groups['maxSeats'] ?? 0),
    buttonSeat: Number(groups['seat']),
    nextLine: 2,
  }
}

function readSeat(
  line: string,
  grammar: Grammar,
  locale: PokerStarsLocale,
  log: IssueLog,
  lineNumber: number,
): SeatDraft | undefined {
  const { text, matched } = stripSuffix(line, locale.sittingOutSuffixes)
  const groups = matchAny(grammar.seat, text)
  if (groups === undefined) return undefined

  const stack = readAmount(groups['stack'], locale, log, lineNumber, line)
  if (stack === undefined) return undefined

  const bounty = groups['bounty'] === undefined
    ? undefined
    : readAmount(groups['bounty'], locale, log, lineNumber, line)

  return {
    seat: Number(groups['seat']),
    playerId: groups['player'] ?? '',
    stack,
    sittingOut: matched,
    acted: false,
    ...(bounty === undefined ? {} : { bounty }),
  }
}

interface BodyResult {
  streets: StreetDraft[]
  collected: CollectedDraft[]
  uncalled: { playerId: string; amount: Chips }[]
  committed: Map<string, Chips>
  hero: string | undefined
  summaryLine: number
  board: Card[]
}

function readBody(
  lines: readonly string[],
  start: number,
  grammar: Grammar,
  locale: PokerStarsLocale,
  log: IssueLog,
  byPlayer: Map<string, SeatDraft>,
  bigBlind: Chips,
): BodyResult {
  const streets: StreetDraft[] = [{ name: 'preflop', board: [], actions: [] }]
  const collected: CollectedDraft[] = []
  const uncalled: { playerId: string; amount: Chips }[] = []
  const committed = new Map<string, Chips>()
  const board: Card[] = []

  let streetCommitted = new Map<string, Chips>()
  let hero: string | undefined
  let actionIndex = 0
  let summaryLine = lines.length

  const current = (): StreetDraft => streets[streets.length - 1] as StreetDraft

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i] as string
    const lineNumber = i + 1
    if (line === '') continue

    if (line.startsWith(locale.streets.summary)) {
      summaryLine = i + 1
      break
    }

    const street = streetMarker(line, locale)
    if (street !== undefined) {
      if (street !== 'preflop') {
        const revealed = newBoardCards(line, log, lineNumber)
        board.push(...revealed)
        streets.push({ name: street, board: revealed, actions: [] })
        streetCommitted = new Map()
      }
      continue
    }

    const dealt = matchAny(grammar.dealtTo, line)
    if (dealt !== undefined) {
      const player = dealt['player'] ?? ''
      hero ??= player
      const seat = byPlayer.get(player)
      const dealtCards = readCards(dealt['cards'], log, lineNumber, line)
      if (seat && dealtCards) seat.holeCards = dealtCards
      continue
    }

    const returned = matchAny(grammar.uncalledBet, line)
    if (returned !== undefined) {
      const amount = readAmount(returned['amount'], locale, log, lineNumber, line)
      if (amount !== undefined) uncalled.push({ playerId: returned['player'] ?? '', amount })
      continue
    }

    const pot = readCollected(line, grammar, locale, log, lineNumber)
    if (pot !== undefined) {
      collected.push(pot)
      continue
    }

    if (isNoise(line, locale)) continue

    const split = PLAYER_ACTION.exec(line)
    if (split === null) {
      log.warn('unknown-line', 'Line not recognised', { line: lineNumber, text: line })
      continue
    }

    const playerId = split.groups?.['player'] as string
    const seat = byPlayer.get(playerId)
    if (seat === undefined) {
      log.warn('unknown-player', `Action by ${playerId}, who has no seat`, {
        line: lineNumber,
        text: line,
      })
      continue
    }

    const action = readAction({
      rest: split.groups?.['rest'] as string,
      playerId,
      street: current().name,
      index: actionIndex,
      grammar,
      locale,
      log,
      lineNumber,
      line,
      streetCommitted,
      bigBlind,
    })

    if (action === undefined) continue

    actionIndex += 1
    seat.acted = true
    current().actions.push(action)
    if (action.contributed !== 0) {
      committed.set(playerId, Money.add(committed.get(playerId) ?? Money.ZERO, action.contributed))
    }
  }

  return { streets, collected, uncalled, committed, hero, summaryLine, board }
}

interface ActionInput {
  rest: string
  playerId: string
  street: StreetName
  index: number
  grammar: Grammar
  locale: PokerStarsLocale
  log: IssueLog
  lineNumber: number
  line: string
  streetCommitted: Map<string, Chips>
  bigBlind: Chips
}

function readAction(input: ActionInput): Action | undefined {
  const { grammar, locale, log, lineNumber, line, streetCommitted, playerId } = input
  const { text, matched: isAllIn } = stripSuffix(input.rest, locale.allInSuffixes)

  let kind: ActionKind | undefined
  let groups: Record<string, string> | undefined
  for (const candidate of grammar.actions) {
    const hit = matchAny(candidate.patterns, text)
    if (hit !== undefined) {
      kind = candidate.kind
      groups = hit
      break
    }
  }

  if (kind === undefined || groups === undefined) {
    if (isNoise(text, locale)) return undefined
    log.warn('unknown-action', `Unrecognised action ${JSON.stringify(text)}`, {
      line: lineNumber,
      text: line,
    })
    return undefined
  }

  const already = streetCommitted.get(playerId) ?? Money.ZERO
  const printed = groups['amount'] ?? groups['by']
  const amount = printed === undefined
    ? undefined
    : readAmount(printed, locale, log, lineNumber, line)
  const toAmount = groups['to'] === undefined
    ? undefined
    : readAmount(groups['to'], locale, log, lineNumber, line)

  let contributed: Chips = Money.ZERO
  switch (kind) {
    case 'raise': {
      if (toAmount === undefined) {
        log.warn('raise-without-total', 'Raise has no total', { line: lineNumber, text: line })
        return undefined
      }
      contributed = Money.sub(toAmount, already)
      streetCommitted.set(playerId, toAmount)
      break
    }
    case 'call':
    case 'bet':
    case 'post-sb':
    case 'post-bb':
    case 'straddle': {
      contributed = amount ?? Money.ZERO
      streetCommitted.set(playerId, Money.add(already, contributed))
      break
    }
    case 'post-dead': {
      // Only the big blind portion is live; the rest is dead money that does
      // not count towards what this player has to call.
      contributed = amount ?? Money.ZERO
      streetCommitted.set(playerId, Money.min(contributed, input.bigBlind))
      break
    }
    case 'post-ante': {
      // Antes are dead money: they never count towards the current bet.
      contributed = amount ?? Money.ZERO
      break
    }
    default:
      contributed = Money.ZERO
  }

  if (contributed < 0) {
    log.warn('negative-contribution', 'Action moves a negative amount into the pot', {
      line: lineNumber,
      text: line,
    })
    contributed = Money.ZERO
  }

  const shownCards = groups['cards'] === undefined
    ? undefined
    : readCards(groups['cards'], log, lineNumber, line)

  return {
    index: input.index,
    street: input.street,
    playerId,
    kind,
    contributed,
    isAllIn,
    ...(amount === undefined ? {} : { amount }),
    ...(toAmount === undefined ? {} : { toAmount }),
    ...(shownCards === undefined ? {} : { cards: shownCards }),
    ...(groups['desc'] === undefined ? {} : { handDescription: groups['desc'] }),
  }
}

interface SummaryResult {
  totalPot: Chips | undefined
  rake: Chips | undefined
  board: Card[] | undefined
  revealed: Map<number, { cards: Card[]; revealed: 'shown' | 'mucked' }>
  positions: Map<number, Position>
}

function readSummary(
  lines: readonly string[],
  start: number,
  grammar: Grammar,
  locale: PokerStarsLocale,
  log: IssueLog,
  seats: ReadonlyMap<number, SeatDraft>,
): SummaryResult {
  const result: SummaryResult = {
    totalPot: undefined,
    rake: undefined,
    board: undefined,
    revealed: new Map(),
    positions: new Map(),
  }
  const labels = new Map<string, Position>([
    [locale.summary.positions.button, 'BTN'],
    [locale.summary.positions.sb, 'SB'],
    [locale.summary.positions.bb, 'BB'],
  ])

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i] as string
    const lineNumber = i + 1
    if (line === '') continue

    const total = grammar.summary.totalPot.exec(line)?.groups?.['pot']
    if (total !== undefined) {
      result.totalPot = readAmount(total, locale, log, lineNumber, line)
      const rake = grammar.summary.rake.exec(line)?.groups?.['rake']
      if (rake !== undefined) result.rake = readAmount(rake, locale, log, lineNumber, line)
      continue
    }

    const boardCards = grammar.summary.board.exec(line)?.groups?.['cards']
    if (boardCards !== undefined) {
      result.board = readCards(boardCards, log, lineNumber, line)
      continue
    }

    const seatGroups = grammar.summary.seat.exec(line)?.groups
    if (seatGroups === undefined) continue

    const seatNo = Number(seatGroups['seat'])
    const seat = seats.get(seatNo)
    // The summary can mention a seat that was not dealt in; it took no part in
    // the hand, so there is nothing to record.
    if (seat === undefined) continue

    const rest = seatGroups['rest'] ?? ''
    const tail = rest.startsWith(seat.playerId) ? rest.slice(seat.playerId.length) : rest

    const label = SUMMARY_POSITION.exec(tail)?.[1]
    const position = label === undefined ? undefined : labels.get(label)
    if (position !== undefined) result.positions.set(seatNo, position)

    const shown = grammar.summary.shown.exec(rest)?.groups?.['cards']
    const mucked = grammar.summary.mucked.exec(rest)?.groups?.['cards']
    if (shown !== undefined) {
      result.revealed.set(seatNo, {
        cards: readCards(shown, log, lineNumber, line) ?? [],
        revealed: 'shown',
      })
    } else if (mucked !== undefined) {
      result.revealed.set(seatNo, {
        cards: readCards(mucked, log, lineNumber, line) ?? [],
        revealed: 'mucked',
      })
    }
  }

  return result
}

interface AssembleInput {
  raw: string
  options: ParseOptions
  locale: PokerStarsLocale
  log: IssueLog
  header: NonNullable<ReturnType<typeof parseHeaderLine>>
  table: TableInfo
  seats: Map<number, SeatDraft>
  byPlayer: Map<string, SeatDraft>
  body: BodyResult
  summary: SummaryResult
}

function assemble(input: AssembleInput): Hand {
  const { log, locale, header, table, seats, body, summary } = input

  // A player marked as sitting out who nonetheless acted was dealt in: the
  // marker means "sitting out after this hand".
  const drafts = [...seats.values()].sort((a, b) => a.seat - b.seat)
  const dealtIn = drafts.filter((s) => !s.sittingOut || s.acted)

  const positions = new Map(
    derivePositions({ seats: dealtIn.map((s) => s.seat), buttonSeat: table.buttonSeat }).map(
      (p) => [p.seat, p.position] as const,
    ),
  )

  for (const [seat, expected] of summary.positions) {
    const derived = positions.get(seat)
    if (derived === undefined || derived === expected) continue
    // Heads-up, the button posts the small blind, so the two labels name the
    // same seat and the summary may use either.
    if (dealtIn.length === 2 && derived === 'BTN' && expected === 'SB') continue
    log.warn(
      'position-mismatch',
      `Seat ${seat} derived as ${derived} but the summary calls it ${expected}`,
    )
  }

  const showdown: Showdown[] = []
  for (const street of body.streets) {
    for (const action of street.actions) {
      if (action.kind === 'show' && action.cards) {
        showdown.push({
          playerId: action.playerId,
          cards: action.cards,
          revealed: 'shown',
          ...(action.handDescription === undefined ? {} : { description: action.handDescription }),
        })
      }
    }
  }

  for (const [seatNo, reveal] of summary.revealed) {
    const draft = seats.get(seatNo)
    if (draft === undefined || reveal.cards.length === 0) continue
    draft.holeCards ??= reveal.cards
    if (!showdown.some((s) => s.playerId === draft.playerId)) {
      showdown.push({ playerId: draft.playerId, cards: reveal.cards, revealed: reveal.revealed })
    }
  }

  const pots = buildPots(body.collected)
  const collectedTotal = Money.sum(body.collected.map((c) => c.amount))
  const uncalledTotal = Money.sum(body.uncalled.map((u) => u.amount))
  const contributedTotal = Money.sum([...body.committed.values()])
  const potFromActions = Money.sub(contributedTotal, uncalledTotal)

  const rake = summary.rake ?? Money.sub(potFromActions, collectedTotal)
  const totalPot = summary.totalPot ?? potFromActions

  validate({ log, potFromActions, totalPot, collectedTotal, rake, summary, body })

  const net = buildNet(body)

  const finalSeats: Seat[] = drafts.map((draft) => {
    const position = positions.get(draft.seat)
    return {
      seat: draft.seat,
      playerId: draft.playerId,
      stack: draft.stack,
      isHero: draft.playerId === body.hero,
      sittingOut: draft.sittingOut,
      dealtIn: dealtIn.includes(draft),
      ...(position === undefined ? {} : { position }),
      ...(draft.holeCards === undefined ? {} : { holeCards: draft.holeCards }),
      ...(draft.bounty === undefined ? {} : { bounty: draft.bounty }),
    }
  })

  const streets: Street[] = body.streets
    .filter((s, i) => i === 0 || s.actions.length > 0 || s.board.length > 0)
    .map((s) => ({ name: s.name, board: s.board, actions: s.actions }))

  const results: HandResults = {
    pots,
    rake,
    totalPot,
    uncalledReturns: body.uncalled,
    showdown,
    net,
  }

  return {
    id: makeHandId({
      site: SITE_ID,
      siteHandId: header.siteHandId,
      tableName: table.name,
      playedAtLocal: header.timestamp.local,
    }),
    source: {
      site: SITE_ID,
      siteHandId: header.siteHandId,
      language: locale.language,
      ...(input.options.keepRaw ? { raw: input.raw } : {}),
    },
    playedAt: header.timestamp.instant,
    playedAtLocal: header.timestamp.local,
    playedAtTz: header.timestamp.timezone,
    game: header.game,
    table: {
      name: table.name,
      maxSeats: table.maxSeats > 0 ? table.maxSeats : drafts.length,
      buttonSeat: table.buttonSeat,
    },
    ...(body.hero === undefined ? {} : { hero: body.hero }),
    seats: finalSeats,
    streets,
    results,
  }
}

function buildPots(collected: readonly CollectedDraft[]): Pot[] {
  const byKey = new Map<string, Pot>()
  for (const entry of collected) {
    const key = `${entry.kind}:${entry.index}`
    const existing = byKey.get(key)
    if (existing === undefined) {
      byKey.set(key, {
        kind: entry.kind,
        index: entry.index,
        amount: entry.amount,
        winners: [entry.playerId],
      })
    } else {
      byKey.set(key, {
        ...existing,
        amount: Money.add(existing.amount, entry.amount),
        winners: [...existing.winners, entry.playerId],
      })
    }
  }
  return [...byKey.values()].sort((a, b) => a.index - b.index)
}

/**
 * What each player is up or down over the hand: everything they put in, less
 * what came back uncalled, plus what they collected.
 *
 * The winnings come from the individual `collected` lines rather than from the
 * assembled pots. Splitting a pot's total back across its winners would lose
 * the odd chip that the site awards to one of them.
 */
function buildNet(body: BodyResult): Record<string, Chips> {
  const net: Record<string, Chips> = {}
  for (const [playerId, amount] of body.committed) net[playerId] = Money.negate(amount)
  for (const back of body.uncalled) {
    net[back.playerId] = Money.add(net[back.playerId] ?? Money.ZERO, back.amount)
  }
  for (const won of body.collected) {
    net[won.playerId] = Money.add(net[won.playerId] ?? Money.ZERO, won.amount)
  }
  return net
}

interface ValidateInput {
  log: IssueLog
  potFromActions: Chips
  totalPot: Chips
  collectedTotal: Chips
  rake: Chips
  summary: SummaryResult
  body: BodyResult
}

/**
 * Cross-checks our arithmetic against the site's own numbers. This is what
 * turns a missing or mistranslated action token into a loud failure instead of
 * a hand that looks fine but has the wrong pot in it.
 */
function validate(input: ValidateInput): void {
  const { log, summary } = input

  if (summary.totalPot !== undefined && summary.totalPot !== input.potFromActions) {
    log.fail(
      'pot-mismatch',
      `Actions add up to ${Money.toDecimalString(input.potFromActions)} but the summary reports ` +
        `${Money.toDecimalString(summary.totalPot)}; an action was probably not understood`,
    )
  }

  if (summary.totalPot !== undefined) {
    const payout = Money.add(input.collectedTotal, input.rake)
    if (payout !== summary.totalPot) {
      log.fail(
        'payout-mismatch',
        `Collected plus rake is ${Money.toDecimalString(payout)} but the total pot is ` +
          `${Money.toDecimalString(summary.totalPot)}`,
      )
    }
  }

  if (summary.board !== undefined) {
    const fromStreets = input.body.board.join(' ')
    const fromSummary = summary.board.join(' ')
    if (fromStreets !== fromSummary) {
      log.warn('board-mismatch', `Board ${fromStreets} does not match the summary ${fromSummary}`)
    }
  }
}

function readCollected(
  line: string,
  grammar: Grammar,
  locale: PokerStarsLocale,
  log: IssueLog,
  lineNumber: number,
): CollectedDraft | undefined {
  for (const candidate of grammar.collected) {
    const groups = matchAny(candidate.patterns, line)
    if (groups === undefined) continue
    const amount = readAmount(groups['amount'], locale, log, lineNumber, line)
    if (amount === undefined) return undefined
    const index = groups['potIndex'] === undefined ? candidate.defaultIndex : Number(groups['potIndex'])
    return { playerId: groups['player'] ?? '', amount, kind: candidate.kind, index }
  }
  return undefined
}

function streetMarker(line: string, locale: PokerStarsLocale): StreetName | undefined {
  const { streets } = locale
  if (line.startsWith(streets.preflop)) return 'preflop'
  if (line.startsWith(streets.flop)) return 'flop'
  if (line.startsWith(streets.turn)) return 'turn'
  if (line.startsWith(streets.river)) return 'river'
  if (line.startsWith(streets.showdown)) return 'showdown'
  return undefined
}

/** The cards a street marker reveals: the last bracketed group on the line. */
function newBoardCards(line: string, log: IssueLog, lineNumber: number): Card[] {
  const groups = [...line.matchAll(BRACKETS)]
  const last = groups[groups.length - 1]?.[1]
  if (last === undefined) return []
  return readCards(last, log, lineNumber, line) ?? []
}

function readCards(
  text: string | undefined,
  log: IssueLog,
  lineNumber: number,
  line: string,
): Card[] | undefined {
  if (text === undefined) return undefined
  try {
    return parseCards(text)
  } catch (cause) {
    log.warn('bad-cards', (cause as Error).message, { line: lineNumber, text: line })
    return undefined
  }
}

function readAmount(
  text: string | undefined,
  locale: PokerStarsLocale,
  log: IssueLog,
  lineNumber: number,
  line: string,
): Chips | undefined {
  if (text === undefined) return undefined
  try {
    return Money.fromDecimalString(text, locale.numberFormat)
  } catch (cause) {
    log.fail('bad-amount', (cause as Error).message, { line: lineNumber, text: line })
    return undefined
  }
}

function isNoise(line: string, locale: PokerStarsLocale): boolean {
  return locale.noise.some((token) => line.includes(token))
}

/** Removes a trailing marker such as ` and is all-in`, reporting whether it
 * was there. Markers are stripped before matching so every action template
 * stays free of optional syntax. */
function stripSuffix(
  text: string,
  suffixes: readonly string[],
): { text: string; matched: boolean } {
  for (const suffix of suffixes) {
    if (text.endsWith(suffix)) {
      return { text: text.slice(0, -suffix.length).trim(), matched: true }
    }
  }
  return { text, matched: false }
}
