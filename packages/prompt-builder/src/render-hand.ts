import {
  Money,
  type Card,
  type HandContext,
  type MadeHand,
  type StreetName,
  type ActionView,
} from '@poker/core'
import type { LeakEvent } from '@poker/rules'

import type { AnalysedHand } from './analyse.js'

/**
 * Renders a hand the way a player would talk through it.
 *
 * Not the raw hand history: that costs three times the tokens and has to be
 * re-derived by whoever reads it — pot sizes, bet sizes as a share of the pot,
 * positions, what the hero actually held. All of that is computed here once, so
 * the reader spends its attention on the poker instead of the arithmetic.
 */

const MADE_HAND_NAMES: Readonly<Record<MadeHand, string>> = {
  nothing: 'niente',
  'ace-high': 'asso alto',
  underpair: 'coppia sotto al board',
  'bottom-pair': 'coppia bassa',
  'middle-pair': 'coppia intermedia',
  'second-pair': 'seconda coppia',
  'top-pair': 'top pair',
  overpair: 'overpair',
  'two-pair': 'doppia coppia',
  set: 'set',
  trips: 'tris',
  straight: 'scala',
  flush: 'colore',
  'full-house': 'full',
  quads: 'poker',
  'straight-flush': 'scala reale',
}

const STREET_NAMES: Readonly<Record<StreetName, string>> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
}

export interface RenderOptions {
  /** "Mano 3 di 5". Omitted when a hand is rendered on its own. */
  readonly index?: number
  readonly total?: number
}

export function renderHand(hand: AnalysedHand, options: RenderOptions = {}): string {
  const { context } = hand
  const lines: string[] = []

  lines.push(header(hand, options))
  lines.push(subheader(hand))

  let previousPlayers = context.hand.seats.filter((seat) => seat.dealtIn).length
  let previousStrength: string | undefined
  const seen = new Set<string>()

  for (const street of context.streets) {
    if (street.name === 'showdown') continue

    const note = streetNote(context, street.name, previousStrength)
    previousStrength = note.strength
    lines.push(streetHeader(context, street.name, note.text))

    lines.push(...renderActions(context, street.name, hand.leaks, seen))

    const players = context.playersInAt(nextStreet(street.name) ?? 'river').length
    const potAfter = potAfterStreet(context, street.name)
    if (isLastPlayedStreet(context, street.name)) continue

    lines.push(
      `  → piatto ${round(potAfter)}bb` +
        (players !== previousPlayers ? `, ${players} giocatori` : ''),
    )
    previousPlayers = players
  }

  lines.push(result(hand))
  const leakLine = leakSummary(hand.leaks)
  if (leakLine !== undefined) lines.push(leakLine)

  return lines.join('\n')
}

function header(hand: AnalysedHand, options: RenderOptions): string {
  const net = hand.context.heroNetBB()
  const outcome =
    net > 0 ? `vinta ${round(net)}bb` : net < 0 ? `persa ${round(-net)}bb` : 'pareggiata'

  const position =
    options.index !== undefined && options.total !== undefined
      ? `Mano ${options.index} di ${options.total}`
      : `Mano ${hand.context.hand.source.siteHandId}`

  const ruleIds = [...new Set(hand.leaks.map((leak) => leak.ruleId))]
  const leaks = ruleIds.length === 0 ? '' : ` — [${ruleIds.join(', ')}]`

  return `### ${position} — ${outcome}${leaks}`
}

function subheader(hand: AnalysedHand): string {
  const { context } = hand
  const parts = [
    `${stakesLabel(context)} ${context.hand.table.maxSeats}-max`,
    `Hero: ${context.heroPosition ?? '?'} (${round(context.effectiveStackBB('preflop'))}bb)`,
    shortDate(context.hand.playedAtLocal),
    `mano #${hand.indexInSession} della sessione`,
  ]
  return parts.join(' | ')
}

/** `NL2` is the hundred-big-blind buy-in, which is how players name a game. */
function stakesLabel(context: HandContext): string {
  const { game } = context.hand
  if (game.type !== 'cash') {
    return game.level === undefined ? 'Torneo' : `Torneo liv.${game.level}`
  }
  const buyIn = Number(Money.toDecimalString(game.stakes.bb, 0)) * 100
  const rounded = buyIn >= 10 ? Math.round(buyIn) : Number(buyIn.toFixed(1))
  return `${game.limit.toUpperCase()}${rounded}`
}

function shortDate(local: string): string {
  // `2026-09-04T23:13:09` -> `04/09 23:13`
  const [date, time] = local.split('T')
  const [, month, day] = (date ?? '').split('-')
  return `${day ?? '??'}/${month ?? '??'} ${(time ?? '').slice(0, 5)}`
}

interface StreetNote {
  readonly text: string | undefined
  readonly strength: string | undefined
}

/**
 * The one thing worth saying about a street beyond the cards. What the hero
 * holds when it changes, and otherwise what the board just did — repeating
 * "top pair" on every street buries the turn that paired it.
 */
function streetNote(
  context: HandContext,
  street: StreetName,
  previousStrength: string | undefined,
): StreetNote {
  if (street === 'preflop') return { text: undefined, strength: undefined }

  const strength = context.heroHandStrength(street)
  const described = strength === undefined ? undefined : describeStrength(strength)

  if (described !== undefined && described !== previousStrength) {
    return { text: `Hero ha ${described}`, strength: described }
  }

  const texture = context.boardTextureAt(street)
  const board = context.boardAt(street)
  const justDealt = context.streetView(street)?.board ?? []

  if (texture?.paired === true && pairedByLastCard(board, justDealt)) {
    return { text: 'board appaiato', strength: described }
  }
  if (texture?.suitedness === 'monotone') return { text: 'board monocolore', strength: described }

  return { text: undefined, strength: described }
}

function pairedByLastCard(board: readonly Card[], justDealt: readonly Card[]): boolean {
  const dealt = justDealt[0]
  if (dealt === undefined) return false
  const rank = dealt[0]
  return board.filter((card) => card[0] === rank).length > 1
}

function describeStrength(strength: {
  made: MadeHand
  topKicker: boolean
  draws: { flush: boolean; openEnded: boolean; gutshot: boolean }
}): string {
  const draws: string[] = []
  if (strength.draws.flush) draws.push('progetto di colore')
  if (strength.draws.openEnded) draws.push('bilaterale')
  else if (strength.draws.gutshot) draws.push('gutshot')

  // "niente + progetto di colore" is not how anyone describes a flush draw.
  if (strength.made === 'nothing' && draws.length > 0) return draws.join(' e ')

  const parts: string[] = [MADE_HAND_NAMES[strength.made]]
  if (strength.made === 'top-pair' && strength.topKicker) parts.push('top kicker')

  const made = parts.join(' ')
  return draws.length === 0 ? made : `${made} + ${draws.join(' e ')}`
}

function streetHeader(context: HandContext, street: StreetName, note: string | undefined): string {
  const pot = street === 'preflop' ? context.deadMoneyBB() : context.potAtBB(street)
  const board = context.streetView(street)?.board ?? []
  const cards = board.length === 0 ? '' : ` [${board.join(' ')}]`
  return `${STREET_NAMES[street]}${cards} (piatto ${round(pot)}bb)${note === undefined ? '' : ` — ${note}`}`
}

function isPost(view: ActionView): boolean {
  return view.action.kind.startsWith('post-') || view.action.kind === 'straddle'
}

/**
 * Actions, grouped the way they read aloud: a run of checks and calls on one
 * line, and anything that needs a number or carries a warning on its own.
 */
function renderActions(
  context: HandContext,
  street: StreetName,
  leaks: readonly LeakEvent[],
  seen: Set<string>,
): string[] {
  const views = context.streetView(street)?.actions ?? []
  const lines: string[] = []
  let run: string[] = []

  const flush = (): void => {
    if (run.length > 0) lines.push(`  ${run.join(' · ')}`)
    run = []
  }

  for (const view of views) {
    if (isPost(view)) continue
    // The result line already says who showed what; repeating "non mostra"
    // mid-street only adds a line.
    if (view.action.kind === 'muck' || view.action.kind === 'no-show') continue

    const label = actorLabel(context, view, seen)
    const marker = leakMarker(leaks, view)
    const odds = potOddsNote(context, view)
    const aggressive = view.action.kind === 'bet' || view.action.kind === 'raise'
    const cards = heroCards(context, view, street)

    const text = `${label} ${describeAction(context, view)}${cards}`

    if (aggressive || marker !== '' || cards !== '') {
      flush()
      lines.push(`  ${text}${marker}`)
    } else {
      run.push(text)
    }

    if (odds !== undefined) {
      flush()
      lines.push(`  ${odds}`)
    }
  }

  flush()
  return lines
}

/** `Hero (MP, 64bb)` the first time a player acts, `BTN` afterwards. */
function actorLabel(context: HandContext, view: ActionView, seen: Set<string>): string {
  const isHero = view.action.playerId === context.hero?.playerId
  const seat = context.hand.seats.find((s) => s.playerId === view.action.playerId)
  const name = isHero ? 'Hero' : (seat?.position ?? view.action.playerId)

  if (seen.has(view.action.playerId)) return name
  seen.add(view.action.playerId)

  const stack = round(context.bb(seat?.stack ?? Money.ZERO))
  return isHero ? `Hero (${seat?.position ?? '?'}, ${stack}bb)` : `${name} (${stack}bb)`
}

function describeAction(context: HandContext, view: ActionView): string {
  const { action } = view
  const size = context.bb(action.contributed)

  // Preflop the pot is only the blinds, so every open is over a hundred per
  // cent of it. Quoting that, and calling a standard three big blind raise an
  // overbet, would be noise dressed up as analysis.
  const showShare = view.street !== 'preflop'
  const share = showShare ? ` (${Math.round(view.sizeAsPotFraction * 100)}% piatto${view.sizeAsPotFraction > 1 ? ' — overbet' : ''})` : ''

  switch (action.kind) {
    case 'fold':
      return 'fold'
    case 'check':
      return 'check'
    case 'call':
      return action.isAllIn ? `call ${round(size)}bb all-in` : 'call'
    case 'bet':
      return action.isAllIn ? `all-in ${round(size)}bb${share}` : `bet ${round(size)}bb${share}`
    case 'raise': {
      const to = context.bb(action.toAmount ?? action.contributed)
      return action.isAllIn ? `all-in ${round(to)}bb${share}` : `raise a ${round(to)}bb${share}`
    }
    case 'show':
      return `mostra ${(action.cards ?? []).join(' ')}`
    default:
      return action.kind
  }
}

function heroCards(context: HandContext, view: ActionView, street: StreetName): string {
  if (street !== 'preflop') return ''
  if (view.action.playerId !== context.hero?.playerId) return ''
  const first = context.heroFirstDecision('preflop')
  if (first?.action.index !== view.action.index) return ''
  const cards = context.hero?.holeCards
  return cards === undefined ? '' : ` con ${cards.join(' ')}`
}

function leakMarker(leaks: readonly LeakEvent[], view: ActionView): string {
  const hits = leaks
    .filter((leak) => leak.actionIndex === view.action.index)
    .map((leak) => leak.ruleId)
  return hits.length === 0 ? '' : `          ⚠ ${[...new Set(hits)].join(', ')}`
}

/** The arithmetic a player should have done, spelled out. */
function potOddsNote(context: HandContext, view: ActionView): string | undefined {
  if (view.action.playerId !== context.hero?.playerId) return undefined
  if (view.action.kind !== 'call' && view.action.kind !== 'fold') return undefined
  // Calling exactly one big blind preflop is a limp, not a price decision.
  if (view.toCall <= context.bigBlind && view.street === 'preflop') return undefined
  if (view.toCall === 0) return undefined

  const toCall = round(context.bb(view.toCall))
  const pot = round(context.bb(view.potBefore))
  const equity = Math.round(view.requiredEquity * 100)
  return `(Hero doveva mettere ${toCall}bb per vincerne ${pot} → serviva ${equity}% di equity)`
}

function result(hand: AnalysedHand): string {
  const { context } = hand
  const net = context.heroNetBB()
  const verb = net > 0 ? `vince ${round(net)}bb` : net < 0 ? `perde ${round(-net)}bb` : 'pareggia'

  const shown = context.hand.results.showdown
    .filter((entry) => entry.playerId !== context.hero?.playerId)
    .map((entry) => {
      const seat = context.hand.seats.find((s) => s.playerId === entry.playerId)
      return `${seat?.position ?? entry.playerId} mostra ${entry.cards.join(' ')}`
    })

  const opponents =
    shown.length > 0
      ? ` ${shown.join(', ')}.`
      : context.heroReachedShowdown()
        ? ''
        : ' Nessuno arriva allo showdown.'

  return `Risultato: Hero ${verb}.${opponents}`
}

function leakSummary(leaks: readonly LeakEvent[]): string | undefined {
  if (leaks.length === 0) return undefined

  const byRule = new Map<string, Set<StreetName>>()
  for (const leak of leaks) {
    const streets = byRule.get(leak.ruleId) ?? new Set<StreetName>()
    streets.add(leak.street)
    byRule.set(leak.ruleId, streets)
  }

  const parts = [...byRule].map(([ruleId, streets]) => `${ruleId} (${[...streets].join(', ')})`)
  return `Leak rilevati dalle regole: ${parts.join(', ')}`
}

function nextStreet(street: StreetName): StreetName | undefined {
  const order: readonly StreetName[] = ['preflop', 'flop', 'turn', 'river']
  const index = order.indexOf(street)
  return index === -1 ? undefined : order[index + 1]
}

function isLastPlayedStreet(context: HandContext, street: StreetName): boolean {
  const played = context.streets.filter((s) => s.name !== 'showdown')
  return played[played.length - 1]?.name === street
}

function potAfterStreet(context: HandContext, street: StreetName): number {
  const view = context.streetView(street)
  if (view === undefined) return 0
  const contributed = view.actions.reduce((sum, action) => sum + action.action.contributed, 0)
  return context.bb((view.potAtStart + contributed) as never)
}

function round(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
