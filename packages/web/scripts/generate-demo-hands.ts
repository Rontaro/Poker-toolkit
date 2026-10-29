/**
 * Writes `src/demo/sample-hands.txt`, the hands behind "Prova con mani di
 * esempio": NL2 6-max cash, played by a hero who does not exist against
 * opponents who do not exist, in the English PokerStars format the parser
 * reads.
 *
 *   pnpm --filter @poker/web demo:generate
 *
 * Nothing here comes from a real hand history: every card is dealt by a seeded
 * RNG and every name is invented, so the output is the same on every run and
 * the test can hold the committed file to it. Change the generator, rerun it,
 * commit both.
 *
 * It is a plausible simulation, not a good one. Each player follows a handful
 * of thresholds (open ranges by position, a percentile for 3-bets, a tier of
 * made hand for postflop) and the betting engine underneath keeps the
 * arithmetic exact, because the parser checks it: what matters is that the
 * pots add up and that the app has something to show on every tab. The hero
 * carries a few habits on purpose -- open-limping, min-opening, betting tiny,
 * flatting from the small blind, loosening up after a big loss -- so that the
 * leak rules and the tilt view have something to find.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { RANKS, SUITS, categoryOf, describeStrength, evaluate, kickersOf, type Card } from '@poker/core'
import { mulberry32 } from '@poker/equity'

// ─── the sample ─────────────────────────────────────────────────────────────

/** Picked among a few for a sample with a bit of everything: winning and
 * losing sessions, side pots, several kinds of leak. */
const SEED = 5
export const HERO = 'DemoHero'

/** Five sittings on five days, so Andamento has sessions to compare. The
 * second one runs past midnight, where the client stops padding the hour. */
const SESSIONS = [
  { day: [2026, 9, 7], start: [21, 12, 40], hands: 58, table: 'Demo Aquila III', heroSeat: 2 },
  { day: [2026, 9, 10], start: [23, 20, 5], hands: 72, table: 'Demo Lyra VI', heroSeat: 5 },
  { day: [2026, 9, 13], start: [15, 41, 22], hands: 46, table: 'Demo Cygnus II', heroSeat: 1 },
  { day: [2026, 9, 17], start: [20, 3, 10], hands: 80, table: 'Demo Draco IV', heroSeat: 4 },
  { day: [2026, 9, 22], start: [21, 47, 55], hands: 64, table: 'Demo Orion V', heroSeat: 3 },
] as const

/** Opponents, plainly made up. The test checks that no other name appears. */
export const OPPONENTS = [
  'FeltGhost', 'MuckMuppet', 'TurnTortoise', 'RiverRaven', 'LimpLizard', 'NutsNewt',
  'PocketPigeon', 'BluffBadger', 'OverbetOtter', 'TiltTurtle', 'CheckCrab', 'ShoveSquid',
  'FoldFlamingo', 'RakeRabbit', 'KickerKoala', 'GutshotGecko', 'DonkDolphin', 'ValueVole',
  'SlowrollSloth', 'ChopChipmunk', 'ButtonBeetle', 'BlindBat', 'SnapcallSnail', 'FlopFerret',
] as const

export const DEMO_HAND_COUNT = SESSIONS.reduce((sum, session) => sum + session.hands, 0)
export const DEMO_SESSION_COUNT = SESSIONS.length

// ─── amounts are integer cents: €0.01/€0.02 ─────────────────────────────────

const SB = 1
const BB = 2
const RAKE_PERCENT = 5
const RAKE_CAP = 30

/** `€2`, `€0.30`, `€1.62`: whole euros lose their decimals, as on the client. */
function money(cents: number): string {
  return cents % 100 === 0 ? `€${cents / 100}` : `€${(cents / 100).toFixed(2)}`
}

// ─── randomness ─────────────────────────────────────────────────────────────

/** Seeded with the equity engine's mulberry32: tiny, and the same on every
 * machine. */
class Rng {
  readonly next: () => number
  constructor(seed: number) {
    this.next = mulberry32(seed)
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T
  }
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1))
      ;[items[i], items[j]] = [items[j] as T, items[i] as T]
    }
    return items
  }
}

// ─── preflop: every holding as a percentile, 0 the best ─────────────────────

const DECK: readonly Card[] = RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}` as Card))
const rankOfCard = (c: Card): number => RANKS.indexOf(c[0] as (typeof RANKS)[number])

function preflopScore(a: Card, b: Card): number {
  const hi = Math.max(rankOfCard(a), rankOfCard(b))
  const lo = Math.min(rankOfCard(a), rankOfCard(b))
  if (hi === lo) return 56 + hi * 4
  const suited = a[1] === b[1] ? 8 : 0
  return hi * 4 + lo * 3 + suited - Math.min(hi - lo - 1, 4) * 2
}

const PERCENTILE: ReadonlyMap<number, number> = (() => {
  const scores: number[] = []
  for (let i = 0; i < DECK.length; i += 1)
    for (let j = i + 1; j < DECK.length; j += 1) scores.push(preflopScore(DECK[i] as Card, DECK[j] as Card))
  scores.sort((x, y) => y - x)
  const map = new Map<number, number>()
  scores.forEach((score, index) => {
    if (!map.has(score)) map.set(score, index / scores.length)
  })
  return map
})()

const percentile = (cards: readonly Card[]): number =>
  PERCENTILE.get(preflopScore(cards[0] as Card, cards[1] as Card)) as number

// ─── players ────────────────────────────────────────────────────────────────

interface Style {
  readonly loose: number
  readonly aggro: number
  readonly sticky: number
  readonly limps: boolean
}

const STYLES: readonly Style[] = [
  { loose: 1, aggro: 1, sticky: 1, limps: false }, // regular
  { loose: 0.65, aggro: 0.8, sticky: 0.7, limps: false }, // nit
  { loose: 1.9, aggro: 0.6, sticky: 1.6, limps: true }, // calling station
  { loose: 1.5, aggro: 1.7, sticky: 1.1, limps: false }, // maniac
]
const HERO_STYLE: Style = { loose: 1.25, aggro: 1.3, sticky: 1.15, limps: false }

interface Player {
  readonly name: string
  readonly style: Style
  readonly hero: boolean
  stack: number
}

type Pos = 'BTN' | 'SB' | 'BB' | 'UTG' | 'HJ' | 'CO'
type StreetName = 'preflop' | 'flop' | 'turn' | 'river'

/** Clockwise from the button, which is how positions are named at 6-max. */
const CLOCKWISE: readonly Pos[] = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']
const OPEN: Record<Pos, number> = { UTG: 0.13, HJ: 0.17, CO: 0.25, BTN: 0.4, SB: 0.3, BB: 0 }
const DEFEND: Record<Pos, number> = { UTG: 0.05, HJ: 0.06, CO: 0.08, BTN: 0.13, SB: 0.06, BB: 0.24 }

interface Seat {
  readonly seat: number
  readonly player: Player
  readonly pos: Pos
  readonly cards: readonly Card[]
  stack: number
  /** Put in on the current street. */
  street: number
  /** Put in over the hand, net of anything returned uncalled. */
  total: number
  folded?: StreetName
  allIn: boolean
}

type Decision =
  | { readonly kind: 'fold' }
  | { readonly kind: 'check' }
  | { readonly kind: 'call' }
  | { readonly kind: 'raise'; readonly to: number }

interface Spot {
  readonly street: StreetName
  readonly board: readonly Card[]
  readonly pot: number
  readonly bet: number
  readonly toCall: number
  /** Bets and raises so far on this street (preflop: 1 is the open). */
  readonly raises: number
  readonly limpers: number
  readonly preflopAggressor: Seat | undefined
  readonly tilted: boolean
}

// ─── how they play ──────────────────────────────────────────────────────────

const FOLD: Decision = { kind: 'fold' }
const CHECK: Decision = { kind: 'check' }
const CALL: Decision = { kind: 'call' }
const raiseTo = (to: number): Decision => ({ kind: 'raise', to: Math.round(to) })

function preflop(rng: Rng, s: Seat, spot: Spot): Decision {
  const { style, hero } = s.player
  const loose = style.loose * (spot.tilted ? 1.6 : 1)
  const q = percentile(s.cards)
  const shove = raiseTo(s.street + s.stack)

  if (spot.raises === 0) {
    if (s.pos === 'BB') return spot.limpers > 0 && q < 0.07 * loose ? raiseTo(BB * (4 + spot.limpers)) : CHECK
    if (spot.limpers > 0) {
      if (q < OPEN[s.pos] * 0.6 * loose) return raiseTo(BB * (4 + spot.limpers))
      if (q < OPEN[s.pos] * 1.3 * loose && (style.limps || s.pos === 'SB' || rng.chance(0.3))) return CALL
      return FOLD
    }
    if (q < OPEN[s.pos] * loose) {
      // The hero's min-open, one in five: the small-open leak.
      if (hero) return raiseTo(rng.chance(0.2) ? 2 * BB : 3 * BB)
      return raiseTo(style.limps ? 2 * BB : rng.pick([5, 6, 6]))
    }
    if (style.limps && q < 0.55) return CALL
    // The hero's open-limp with the hands just outside the range.
    if (hero && s.pos !== 'SB' && q < OPEN[s.pos] * 1.6 && rng.chance(0.5)) return CALL
    if (s.pos === 'SB' && q < 0.45 * loose && rng.chance(0.3)) return CALL
    return FOLD
  }

  const facingAllIn = spot.toCall >= s.stack
  if (spot.raises === 1) {
    if (facingAllIn) return q < 0.04 * style.sticky ? CALL : FOLD
    if (q < 0.045 * loose * style.aggro || (q < 0.12 && rng.chance(0.06 * style.aggro))) {
      return raiseTo(spot.bet * (s.pos === 'SB' || s.pos === 'BB' ? 3.6 : 3))
    }
    // The hero's flat from the small blind: the sb-flat leak.
    const defend = hero && s.pos === 'SB' ? 0.15 : DEFEND[s.pos] * loose * style.sticky
    return q < defend && spot.toCall <= s.stack * 0.2 ? CALL : FOLD
  }
  if (spot.raises === 2) {
    if (q < 0.025) return s.stack + s.street < 60 * BB || facingAllIn ? shove : raiseTo(spot.bet * 2.3)
    if (facingAllIn) return q < 0.03 ? CALL : FOLD
    return q < 0.07 * style.sticky && spot.toCall < s.stack * 0.35 ? CALL : FOLD
  }
  if (q < 0.018) return shove
  return q < 0.03 ? CALL : FOLD
}

/** 4 two pair or better, 3 top pair or an overpair, 2 a weaker pair, 1 a
 * real draw, 0 nothing. */
function tierOf(cards: readonly Card[], board: readonly Card[]): number {
  const strength = describeStrength(cards, board)
  if (strength.playsTheBoard) return 0
  if (['top-pair', 'overpair'].includes(strength.made)) return 3
  if (strength.strong) return 4
  if (['middle-pair', 'second-pair', 'underpair', 'bottom-pair'].includes(strength.made)) return 2
  return strength.draws.flush || strength.draws.openEnded ? 1 : 0
}

function postflop(rng: Rng, s: Seat, spot: Spot): Decision {
  const { style, hero } = s.player
  const tier = tierOf(s.cards, spot.board)
  const sized = (fraction: number): Decision => raiseTo(Math.max(BB, spot.pot * fraction))

  if (spot.toCall === 0) {
    let pBet = ([0.12, 0.35, 0.25, 0.75, 0.85][tier] as number) * style.aggro
    if (spot.street === 'flop' && spot.preflopAggressor === s) pBet = Math.max(pBet, 0.6 * style.aggro)
    if (spot.street === 'river' && tier === 1) pBet = 0.2 * style.aggro
    if (!rng.chance(pBet)) return CHECK
    // The hero's tiny bet with a made hand: the min-bet leak.
    if (hero && tier >= 2 && spot.street !== 'river' && spot.pot >= 6 * BB && rng.chance(0.3)) return sized(0.2)
    return sized(rng.pick([0.5, 0.6, 0.75]))
  }

  const odds = spot.toCall / (spot.pot + spot.toCall)
  const canRaise = spot.raises < 2 && spot.toCall < s.stack
  const reraise = (): Decision => raiseTo(spot.bet * 3 > (s.stack + s.street) * 0.6 ? s.stack + s.street : spot.bet * 3)
  if (tier === 4) return canRaise && rng.chance(0.45 * style.aggro) ? reraise() : CALL
  if (tier === 3) {
    if (canRaise && rng.chance(0.12 * style.aggro)) return reraise()
    return odds < 0.4 * style.sticky ? CALL : FOLD
  }
  if (tier === 2) return odds < 0.33 * style.sticky && rng.chance(0.85) ? CALL : FOLD
  if (tier === 1) return spot.street !== 'river' && odds < 0.33 * style.sticky ? CALL : FOLD
  if (canRaise && rng.chance(0.04 * style.aggro)) return reraise()
  return odds < 0.34 && rng.chance(0.15 * style.sticky) ? CALL : FOLD
}

// ─── one hand ───────────────────────────────────────────────────────────────

const RANK_NAMES = ['Deuce', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace']
const name = (rank: number): string => RANK_NAMES[rank] as string
const plural = (rank: number): string => (rank === 4 ? 'Sixes' : `${name(rank)}s`)

/** What the client writes after `shows [..]`. */
function describe(cards: readonly Card[]): string {
  const score = evaluate(cards)
  const [a, b] = kickersOf(score) as [number, number]
  const run = a === 3 ? 'Ace to Five' : `${name(a - 4)} to ${name(a)}`
  switch (categoryOf(score)) {
    case 'high-card': return `high card ${name(a)}`
    case 'pair': return `a pair of ${plural(a)}`
    case 'two-pair': return `two pair, ${plural(a)} and ${plural(b)}`
    case 'trips': return `three of a kind, ${plural(a)}`
    case 'straight': return `a straight, ${run}`
    case 'flush': return `a flush, ${name(a)} high`
    case 'full-house': return `a full house, ${plural(a)} full of ${plural(b)}`
    case 'quads': return `four of a kind, ${plural(a)}`
    case 'straight-flush': return a === 12 ? 'a Royal Flush' : `a straight flush, ${run}`
  }
}

const STREET_LABEL: Record<Exclude<StreetName, 'preflop'>, string> = { flop: 'Flop', turn: 'Turn', river: 'River' }

interface Table {
  readonly rng: Rng
  readonly players: Player[]
  readonly button: number
  readonly header: string
  readonly name: string
  readonly tilted: boolean
}

/** Plays one hand and returns its text. Stacks are updated in place. */
function playHand(table: Table): string {
  const { rng, players } = table
  const deck = rng.shuffle([...DECK])
  const seats: Seat[] = CLOCKWISE.map((pos, offset) => {
    const index = (table.button - 1 + offset) % players.length
    const player = players[index] as Player
    return { seat: index + 1, player, pos, cards: [deck.pop() as Card, deck.pop() as Card], stack: player.stack, street: 0, total: 0, allIn: false }
  })
  const board = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()] as Card[]
  const at = (pos: Pos): Seat => seats.find((s) => s.pos === pos) as Seat
  const preflopOrder = (['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const).map(at)
  const postflopOrder = (['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'] as const).map(at)
  const live = (): Seat[] => seats.filter((s) => s.folded === undefined)
  const hero = seats.find((s) => s.player.hero) as Seat

  const lines: string[] = [table.header, `Table '${table.name}' 6-max Seat #${table.button} is the button`]
  for (const s of [...seats].sort((x, y) => x.seat - y.seat)) {
    lines.push(`Seat ${s.seat}: ${s.player.name} (${money(s.stack)} in chips) `)
  }

  const put = (s: Seat, amount: number): void => {
    s.stack -= amount
    s.street += amount
    s.total += amount
    s.allIn = s.stack === 0
  }
  put(at('SB'), SB)
  put(at('BB'), BB)
  lines.push(`${at('SB').player.name}: posts small blind ${money(SB)}`, `${at('BB').player.name}: posts big blind ${money(BB)}`)
  lines.push('*** HOLE CARDS ***', `Dealt to ${HERO} [${hero.cards.join(' ')}]`)

  let preflopAggressor: Seat | undefined
  let lastAggressor: Seat | undefined

  const bettingRound = (street: StreetName, order: Seat[], shown: readonly Card[]): void => {
    let bet = street === 'preflop' ? BB : 0
    let lastRaise = BB
    let raises = 0
    let limpers = 0
    const acted = new Set<Seat>()
    lastAggressor = undefined

    for (let i = 0, idle = 0; idle < order.length && live().length > 1; i += 1) {
      const s = order[i % order.length] as Seat
      const othersCanAct = live().some((o) => o !== s && !o.allIn)
      if (s.folded !== undefined || s.allIn || (acted.has(s) && s.street >= bet) || (!othersCanAct && s.street >= bet)) {
        idle += 1
        continue
      }
      idle = 0

      const toCall = Math.min(bet - s.street, s.stack)
      const pot = seats.reduce((sum, o) => sum + o.total, 0)
      const spot: Spot = { street, board: shown, pot, bet, toCall, raises, limpers, preflopAggressor, tilted: s.player.hero && table.tilted }
      let decision = street === 'preflop' ? preflop(rng, s, spot) : postflop(rng, s, spot)

      if (decision.kind === 'raise') {
        const to = Math.min(Math.max(decision.to, bet === 0 ? BB : bet + lastRaise), s.street + s.stack)
        decision = !othersCanAct || to <= bet ? (toCall === 0 ? CHECK : CALL) : raiseTo(to)
      }
      if (decision.kind === 'fold' && toCall === 0) decision = CHECK
      if (decision.kind === 'check' && toCall > 0) decision = FOLD

      const who = s.player.name
      if (decision.kind === 'fold') {
        s.folded = street
        lines.push(`${who}: folds `)
      } else if (decision.kind === 'check') {
        lines.push(`${who}: checks `)
      } else if (decision.kind === 'call') {
        put(s, toCall)
        if (street === 'preflop' && raises === 0) limpers += 1
        lines.push(`${who}: calls ${money(toCall)}${s.allIn ? ' and is all-in' : ''}`)
      } else {
        const by = decision.to - bet
        put(s, decision.to - s.street)
        lines.push(
          bet === 0
            ? `${who}: bets ${money(decision.to)}${s.allIn ? ' and is all-in' : ''}`
            : `${who}: raises ${money(by)} to ${money(decision.to)}${s.allIn ? ' and is all-in' : ''}`,
        )
        lastRaise = Math.max(lastRaise, by)
        bet = decision.to
        raises += 1
        lastAggressor = s
        if (street === 'preflop') preflopAggressor = s
        acted.clear()
      }
      acted.add(s)
    }

    // Whatever nobody matched goes back, before the next street is dealt.
    const [top, second] = [...seats].sort((x, y) => y.street - x.street) as [Seat, Seat]
    if (top.street > second.street) {
      const back = top.street - second.street
      top.stack += back
      top.total -= back
      top.allIn = top.stack === 0
      lines.push(`Uncalled bet (${money(back)}) returned to ${top.player.name}`)
    }
    for (const s of seats) s.street = 0
  }

  bettingRound('preflop', preflopOrder, [])
  const streets = [
    { name: 'flop', label: '*** FLOP ***', cards: 3 },
    { name: 'turn', label: '*** TURN ***', cards: 4 },
    { name: 'river', label: '*** RIVER ***', cards: 5 },
  ] as const
  let dealt = 0
  for (const street of streets) {
    if (live().length < 2) break
    const shown = board.slice(0, street.cards)
    const previous = board.slice(0, dealt)
    lines.push(dealt === 0 ? `${street.label} [${shown.join(' ')}]` : `${street.label} [${previous.join(' ')}] [${shown.at(-1)}]`)
    dealt = street.cards
    bettingRound(street.name, postflopOrder, shown)
  }

  // ── pots, rake, and who gets what ──
  const contenders = live()
  const totalPot = seats.reduce((sum, s) => sum + s.total, 0)
  const rake = dealt === 0 ? 0 : Math.min(RAKE_CAP, Math.floor((totalPot * RAKE_PERCENT) / 100))
  const levels = [...new Set(contenders.map((s) => s.total))].sort((x, y) => x - y)
  const layers = levels.map((level, index) => {
    const below = index === 0 ? 0 : (levels[index - 1] as number)
    return {
      amount: seats.reduce((sum, s) => sum + Math.min(s.total, level) - Math.min(s.total, below), 0),
      eligible: contenders.filter((s) => s.total >= level),
    }
  })
  if (layers.reduce((sum, layer) => sum + layer.amount, 0) !== totalPot) throw new Error('pots do not add up')

  // The rake comes out of each pot in proportion, the odd cent from the last;
  // a split pot gives its odd cent to the first winner after the button.
  const score = new Map(contenders.map((s) => [s, dealt === 5 ? evaluate([...s.cards, ...board]) : 0] as const))
  const potName = (index: number): string =>
    layers.length === 1 ? 'pot' : index === 0 ? 'main pot' : layers.length === 2 ? 'side pot' : `side pot-${index}`
  const payouts: { seat: Seat; amount: number; pot: string }[] = []
  let rakeLeft = rake
  layers.forEach((layer, index) => {
    const layerRake = index === layers.length - 1 ? rakeLeft : Math.floor((rake * layer.amount) / totalPot)
    rakeLeft -= layerRake
    const best = Math.max(...layer.eligible.map((s) => score.get(s) as number))
    const winners = postflopOrder.filter((s) => layer.eligible.includes(s) && score.get(s) === best)
    const net = layer.amount - layerRake
    winners.forEach((s, i) => {
      const amount = Math.floor(net / winners.length) + (i < net % winners.length ? 1 : 0)
      payouts.push({ seat: s, amount, pot: potName(index) })
    })
  })
  const won = new Map<Seat, number>()
  for (const { seat, amount } of payouts) won.set(seat, (won.get(seat) ?? 0) + amount)
  const collect = (): void => {
    for (const { seat, amount, pot } of payouts) lines.push(`${seat.player.name} collected ${money(amount)} from ${pot}`)
  }

  const showed = new Set<Seat>()
  if (contenders.length === 1) {
    const [winner] = contenders as [Seat]
    collect()
    lines.push(`${winner.player.name}: doesn't show hand `)
  } else {
    lines.push('*** SHOW DOWN ***')
    const allIn = contenders.some((s) => s.allIn)
    const order = lastAggressor !== undefined && contenders.includes(lastAggressor)
      ? [lastAggressor, ...postflopOrder.filter((s) => s !== lastAggressor && contenders.includes(s))]
      : postflopOrder.filter((s) => contenders.includes(s))
    let best = -1
    for (const s of order) {
      const value = score.get(s) as number
      if (allIn || value >= best) {
        showed.add(s)
        best = Math.max(best, value)
        lines.push(`${s.player.name}: shows [${s.cards.join(' ')}] (${describe([...s.cards, ...board])})`)
      } else {
        lines.push(`${s.player.name}: mucks hand `)
      }
    }
    collect()
  }

  // ── summary ──
  lines.push('*** SUMMARY ***')
  const sides =
    layers.length === 1
      ? ''
      : ` Main pot ${money((layers[0] as { amount: number }).amount)}.` +
        (layers.length === 2
          ? ` Side pot ${money((layers[1] as { amount: number }).amount)}.`
          : layers.slice(1).map((layer, i) => ` Side pot-${i + 1} ${money(layer.amount)}.`).join(''))
  lines.push(`Total pot ${money(totalPot)}${sides} | Rake ${money(rake)} `)
  if (dealt > 0) lines.push(`Board [${board.slice(0, dealt).join(' ')}]`)

  const tag: Partial<Record<Pos, string>> = { BTN: ' (button)', SB: ' (small blind)', BB: ' (big blind)' }
  for (const s of [...seats].sort((x, y) => x.seat - y.seat)) {
    const head = `Seat ${s.seat}: ${s.player.name}${tag[s.pos] ?? ''}`
    const gain = won.get(s) ?? 0
    let tail: string
    if (s.folded === 'preflop') tail = s.total === 0 ? ' folded before Flop (didn\'t bet)' : ' folded before Flop'
    else if (s.folded !== undefined) tail = ` folded on the ${STREET_LABEL[s.folded]}`
    else if (contenders.length === 1) tail = ` collected (${money(gain)})`
    else if (!showed.has(s)) tail = ` mucked [${s.cards.join(' ')}]`
    else {
      const what = describe([...s.cards, ...board])
      tail = gain > 0 ? ` showed [${s.cards.join(' ')}] and won (${money(gain)}) with ${what}` : ` showed [${s.cards.join(' ')}] and lost with ${what}`
    }
    lines.push(head + tail)
    s.player.stack = s.stack + gain
  }

  return lines.join('\r\n')
}

// ─── sessions ───────────────────────────────────────────────────────────────

const pad = (n: number): string => String(n).padStart(2, '0')

/** `2026/09/10 0:05:12`: the hour is not padded, the rest is. */
function stamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${d.getUTCHours()}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

/** CET as the client labels it, ET six hours behind, as in September. */
const ET_BEHIND_MS = 6 * 60 * 60 * 1000

export function generateDemoHands(seed = SEED): string {
  const rng = new Rng(seed)
  const names = rng.shuffle([...OPPONENTS])
  let nextName = 0
  /** The next name in the shuffled pool that is not already at the table. */
  const newOpponent = (seated: readonly Player[]): Player => {
    let candidate = names[nextName++ % names.length] as string
    while (seated.some((player) => player.name === candidate)) candidate = names[nextName++ % names.length] as string
    return {
      name: candidate,
      style: rng.pick(STYLES),
      hero: false,
      stack: rng.pick([200, 200, 200, 150, 250, 120, 300, 90, 60]),
    }
  }
  const heroPlayer: Player = { name: HERO, style: HERO_STYLE, hero: true, stack: 200 }

  let handId = 412_740_000_000 + rng.int(0, 999_999)
  const hands: string[] = []

  for (const [index, session] of SESSIONS.entries()) {
    const players: Player[] = [heroPlayer]
    while (players.length < 6) players.push(newOpponent(players))
    // The hero takes the session's seat; whoever was dealt it moves to seat 1.
    ;[players[0], players[session.heroSeat - 1]] = [players[session.heroSeat - 1] as Player, heroPlayer]
    heroPlayer.stack = 200
    const [year, month, day] = session.day
    let clock = Date.UTC(year, month - 1, day, ...session.start)
    let button = rng.int(1, 6)
    let tilt = 0
    handId += rng.int(40_000_000, 90_000_000)
    const adm = `DEMO${String(index + 1).padStart(4, '0')}SAMPLE00`

    for (let n = 0; n < session.hands; n += 1) {
      const before = heroPlayer.stack
      hands.push(
        playHand({
          rng,
          players,
          button,
          name: session.table,
          tilted: tilt > 0,
          header:
            `PokerStars Hand #${handId}:  Hold'em No Limit (€0.01/€0.02 EUR) [ADM ID: ${adm}] - ` +
            `${stamp(clock)} CET [${stamp(clock - ET_BEHIND_MS)} ET]`,
        }),
      )
      // A pot of thirty big blinds or more lost: the next twenty hands loosen.
      tilt = before - heroPlayer.stack >= 30 * BB ? 20 : Math.max(0, tilt - 1)

      // Between hands: the hero tops up, a busted or bored opponent is replaced.
      if (heroPlayer.stack < 120) heroPlayer.stack = 200
      for (let i = 0; i < players.length; i += 1) {
        const player = players[i] as Player
        if (!player.hero && (player.stack < 40 || rng.chance(0.015))) players[i] = newOpponent(players)
      }
      button = (button % 6) + 1
      handId += rng.int(4_000, 30_000)
      clock += rng.int(28, 75) * 1000
    }
  }

  // UTF-8 with a BOM, CRLF, three blank lines between hands: as the client writes.
  return `﻿${hands.join('\r\n\r\n\r\n\r\n')}\r\n\r\n\r\n`
}

export const DEMO_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'demo', 'sample-hands.txt')

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeFileSync(DEMO_FILE, generateDemoHands(), 'utf8')
  console.log(`${DEMO_HAND_COUNT} mani in ${DEMO_SESSION_COUNT} sessioni scritte in ${DEMO_FILE}`)
}
