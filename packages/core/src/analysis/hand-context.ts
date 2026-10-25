/**
 * A parsed hand answers "what happened". This answers "what does that mean for
 * the hero", which is what every metric, rule and prompt needs and none of them
 * should compute for itself.
 *
 * Everything is derived once, on construction, into a per-action timeline: the
 * pot before the action, what it cost to continue, who was still in. A rule
 * that has those to hand is twenty lines; a rule that has to rebuild them is
 * two hundred, and gets the pot wrong.
 *
 * It lives in `core` because it depends on nothing but the domain model and
 * because metrics, rules and the prompt builder all need the same one. Nothing
 * here reaches outside: no storage, no clock, no configuration.
 */

import {
  describeBoard,
  describeStrength,
  type BoardTexture,
  type HandStrength,
} from '../eval/strength.js'
import { evaluate, type HandScore } from '../eval/hand-rank.js'
import type { Card } from '../cards/card.js'
import * as Money from '../money/chips.js'
import type { Chips } from '../money/chips.js'
import { AGGRESSIVE_KINDS, BETTING_STREETS, type Action, type StreetName } from '../model/action.js'
import type { Hand, Seat } from '../model/hand.js'
import { derivePositions, type Position } from '../table/position.js'

/** One action, with the state of the hand at the moment it was taken. */
export interface ActionView {
  readonly action: Action
  readonly street: StreetName
  /** Everything in the middle before this action, uncalled bets included. */
  readonly potBefore: Chips
  /** What this player had to put in to continue. Zero means they could check. */
  readonly toCall: Chips
  /** Players who had not folded when the action was taken, actor included. */
  readonly playersIn: number
  /** Stack the actor had left before acting. */
  readonly stackBefore: Chips
  /**
   * How big the bet or raise was, as a fraction of the pot before it. The
   * numerator is the total this action commits on the street, not the increment
   * over the previous bet, so the number reads the way a player says it aloud:
   * "betting four into six and a half", "raising to six and a half into
   * sixteen". Zero for anything that is not a bet or a raise.
   */
  readonly sizeAsPotFraction: number
  /**
   * Share of the pot the caller must win to break even on a call: the pot odds,
   * expressed as the equity required. Zero when there is nothing to call.
   */
  readonly requiredEquity: number
}

export interface StreetView {
  readonly name: StreetName
  readonly board: readonly Card[]
  /** Board visible during this street, including earlier streets' cards. */
  readonly boardSoFar: readonly Card[]
  readonly potAtStart: Chips
  readonly actions: readonly ActionView[]
  readonly playersAtStart: number
}

export class HandContext {
  readonly hand: Hand
  readonly hero: Seat | undefined
  readonly bigBlind: Chips
  readonly streets: readonly StreetView[]
  readonly actions: readonly ActionView[]

  /** Position order for postflop play: 0 acts first, the button acts last. */
  readonly #orderBySeat: ReadonlyMap<number, number>
  readonly #strengthCache = new Map<StreetName, HandStrength | undefined>()
  readonly #preflopAggressor: string | undefined
  readonly #showdownScores: ReadonlyMap<string, HandScore>

  constructor(hand: Hand) {
    this.hand = hand
    this.hero = hand.seats.find((s) => s.isHero)
    this.bigBlind = hand.game.stakes.bb

    this.#orderBySeat = new Map(
      derivePositions({
        seats: hand.seats.filter((s) => s.dealtIn).map((s) => s.seat),
        buttonSeat: hand.table.buttonSeat,
      }).map((p) => [p.seat, p.orderPreflop] as const),
    )

    const built = buildTimeline(hand)
    this.streets = built.streets
    this.actions = built.actions
    this.#preflopAggressor = built.preflopAggressor
    this.#showdownScores = buildShowdownScores(hand)
  }

  // ---------------------------------------------------------------- money ---

  /** Any amount in big blinds. Every metric and every prompt works in these. */
  bb(amount: Chips): number {
    return Money.toBigBlinds(amount, this.bigBlind)
  }

  /** Pot at the start of a street, in chips. */
  potAt(street: StreetName): Chips {
    return this.streetView(street)?.potAtStart ?? Money.ZERO
  }

  potAtBB(street: StreetName): number {
    return this.bb(this.potAt(street))
  }

  /**
   * Blinds and antes, in big blinds.
   *
   * `potAt('preflop')` is zero, because the blinds are actions inside the
   * preflop street rather than something that happened before it. That is right
   * for the timeline and wrong for anyone asking "what was in the middle when
   * the first player had to decide", which is what this answers.
   */
  deadMoneyBB(): number {
    const posts = this.streetView('preflop')?.actions.filter((view) => isPost(view.action)) ?? []
    return this.bb(Money.sum(posts.map((view) => view.action.contributed)))
  }

  /** Net result of the hand for the hero, in big blinds. Negative is a loss. */
  heroNetBB(): number {
    const id = this.hero?.playerId
    if (id === undefined) return 0
    return this.bb(this.hand.results.net[id] ?? Money.ZERO)
  }

  heroInvestedBB(): number {
    return this.bb(
      Money.sum(
        this.actions
          .filter((v) => v.action.playerId === this.hero?.playerId)
          .map((v) => v.action.contributed),
      ),
    )
  }

  /** The hero's own stack when the hand was dealt. */
  heroStackBB(): number {
    return this.bb(this.hero?.stack ?? Money.ZERO)
  }

  /**
   * The stack that actually matters: the smaller of the hero's and the largest
   * opponent still in the hand. Betting more than this is impossible, so every
   * sizing decision is measured against it.
   */
  effectiveStackBB(street: StreetName = 'preflop'): number {
    const hero = this.hero
    if (hero === undefined) return 0

    const remaining = (playerId: string): Chips => {
      const seat = this.hand.seats.find((s) => s.playerId === playerId)
      if (seat === undefined) return Money.ZERO
      const spent = Money.sum(
        this.actions
          .filter((v) => v.action.playerId === playerId && streetIndex(v.street) < streetIndex(street))
          .map((v) => v.action.contributed),
      )
      return Money.max(Money.sub(seat.stack, spent), Money.ZERO)
    }

    const live = this.playersInAt(street).filter((id) => id !== hero.playerId)
    if (live.length === 0) return this.bb(remaining(hero.playerId))

    const biggest = live.map(remaining).reduce((a, b) => Money.max(a, b), Money.ZERO)
    return this.bb(Money.min(remaining(hero.playerId), biggest))
  }

  // ------------------------------------------------------------- position ---

  get heroPosition(): Position | undefined {
    return this.hero?.position
  }

  heroPositionIs(...positions: readonly Position[]): boolean {
    const held = this.heroPosition
    return held !== undefined && positions.includes(held)
  }

  /**
   * True when the hero acts last on a street among the players still in. This
   * is structural, not "who happened to act last": a hero who checks and then
   * calls a bet acted twice but was still out of position.
   */
  heroInPosition(street: StreetName): boolean {
    const hero = this.hero
    if (hero === undefined) return false
    const live = this.playersInAt(street)
    if (!live.includes(hero.playerId)) return false

    const heroOrder = this.#orderBySeat.get(hero.seat)
    if (heroOrder === undefined) return false

    return live.every((id) => {
      const seat = this.hand.seats.find((s) => s.playerId === id)
      const order = seat === undefined ? -1 : (this.#orderBySeat.get(seat.seat) ?? -1)
      return order <= heroOrder
    })
  }

  // --------------------------------------------------------------- streets ---

  streetView(street: StreetName): StreetView | undefined {
    return this.streets.find((s) => s.name === street)
  }

  sawStreet(street: StreetName): boolean {
    const view = this.streetView(street)
    if (view === undefined) return false
    const hero = this.hero?.playerId
    return hero !== undefined && this.playersInAt(street).includes(hero)
  }

  boardAt(street: StreetName): readonly Card[] {
    return this.streetView(street)?.boardSoFar ?? []
  }

  boardTextureAt(street: StreetName): BoardTexture | undefined {
    const board = this.boardAt(street)
    return board.length >= 3 ? describeBoard(board) : undefined
  }

  /** Players who had not folded at the start of a street. */
  playersInAt(street: StreetName): string[] {
    const folded = new Set<string>()
    for (const view of this.actions) {
      if (streetIndex(view.street) >= streetIndex(street)) break
      if (view.action.kind === 'fold') folded.add(view.action.playerId)
    }
    return this.hand.seats
      .filter((s) => s.dealtIn && !folded.has(s.playerId))
      .map((s) => s.playerId)
  }

  // --------------------------------------------------------------- actions ---

  heroActions(street?: StreetName): ActionView[] {
    const hero = this.hero?.playerId
    if (hero === undefined) return []
    return this.actions.filter(
      (v) => v.action.playerId === hero && (street === undefined || v.street === street),
    )
  }

  /** Voluntary actions only: posting a blind is not a decision. */
  heroVoluntaryActions(street?: StreetName): ActionView[] {
    return this.heroActions(street).filter((v) => !isPost(v.action))
  }

  /**
   * The hero put chips in by choice on a street. The street is required rather
   * than defaulted: VPIP means "voluntarily put money in *preflop*", and a
   * version of this that quietly spanned every street would count a big blind
   * who checked their option and later called a flop bet as having played the
   * hand voluntarily.
   */
  heroPutMoneyInVoluntarily(street: StreetName): boolean {
    return this.heroVoluntaryActions(street).some((v) => putsMoneyIn(v.action))
  }

  heroRaisedPreflop(): boolean {
    return this.heroActions('preflop').some((v) => v.action.kind === 'raise')
  }

  wasPreflopAggressor(): boolean {
    return this.#preflopAggressor !== undefined && this.#preflopAggressor === this.hero?.playerId
  }

  preflopAggressor(): string | undefined {
    return this.#preflopAggressor
  }

  /**
   * The hero was the first player to put money in the pot by choice. A hero who
   * folded never entered, however early they folded, so this is false for them:
   * the rules that use it are about how the hero opens a pot.
   */
  heroWasFirstIn(): boolean {
    const hero = this.hero?.playerId
    if (hero === undefined) return false

    const entries = this.actions.filter((v) => v.street === 'preflop' && putsMoneyIn(v.action))
    return entries[0]?.action.playerId === hero
  }

  /** Players who limped in before the hero's first preflop decision. */
  limpersBeforeHero(): number {
    const first = this.heroVoluntaryActions('preflop')[0]
    const limit = first?.action.index ?? Number.MAX_SAFE_INTEGER
    return this.actions.filter(
      (v) =>
        v.street === 'preflop' &&
        v.action.index < limit &&
        v.action.kind === 'call' &&
        v.toCall === this.bigBlind,
    ).length
  }

  /** The hero's first decision on a street. Posting a blind is not a decision. */
  heroFirstDecision(street: StreetName): ActionView | undefined {
    return this.heroVoluntaryActions(street)[0]
  }

  /** Bets and raises made on a street before a given point in the hand. */
  aggressionBefore(street: StreetName, actionIndex: number): ActionView[] {
    return this.actions.filter(
      (v) =>
        v.street === street &&
        v.action.index < actionIndex &&
        (AGGRESSIVE_KINDS as readonly string[]).includes(v.action.kind),
    )
  }

  /** The last player to bet or raise on a street. */
  lastAggressorOn(street: StreetName): string | undefined {
    const view = this.streetView(street)
    if (view === undefined) return undefined
    for (let i = view.actions.length - 1; i >= 0; i -= 1) {
      const candidate = view.actions[i]
      if (candidate !== undefined && (AGGRESSIVE_KINDS as readonly string[]).includes(candidate.action.kind)) {
        return candidate.action.playerId
      }
    }
    return undefined
  }

  /**
   * How many raises stood in front of the hero's first preflop decision.
   * Zero means the hero could open, one means they were facing an open and a
   * raise would be a 3-bet, two means a raise would be a 4-bet.
   */
  preflopRaisesFacedByHero(): number {
    const first = this.heroFirstDecision('preflop')
    if (first === undefined) return 0
    return this.aggressionBefore('preflop', first.action.index).length
  }

  /** The hero put in the first raise of the hand. */
  heroOpenedPreflop(): boolean {
    const first = this.heroFirstDecision('preflop')
    if (first === undefined || first.action.kind !== 'raise') return false
    return this.aggressionBefore('preflop', first.action.index).length === 0
  }

  /** After the hero opened, somebody re-raised. */
  heroFacedThreeBet(): boolean {
    if (!this.heroOpenedPreflop()) return false
    const open = this.heroFirstDecision('preflop')
    if (open === undefined) return false
    return this.actions.some(
      (v) =>
        v.street === 'preflop' &&
        v.action.index > open.action.index &&
        v.action.playerId !== this.hero?.playerId &&
        v.action.kind === 'raise',
    )
  }

  /** Players still in when the last action of the hand was taken. */
  playersAtEnd(): string[] {
    const folded = new Set(
      this.actions.filter((v) => v.action.kind === 'fold').map((v) => v.action.playerId),
    )
    return this.hand.seats
      .filter((s) => s.dealtIn && !folded.has(s.playerId))
      .map((s) => s.playerId)
  }

  /**
   * The hero saw the hand through to a showdown.
   *
   * Derived from who was still in rather than from revealed cards: a player who
   * reaches showdown and mucks without showing is still a showdown, and the
   * statistic that divides by it would otherwise be inflated.
   */
  heroReachedShowdown(): boolean {
    const hero = this.hero?.playerId
    if (hero === undefined) return false
    const live = this.playersAtEnd()
    return live.length >= 2 && live.includes(hero)
  }

  /** The first voluntary bet or raise the hero faced on a street, if any. */
  firstAggressionAgainstHero(street: StreetName): ActionView | undefined {
    const hero = this.hero?.playerId
    return this.actions.find(
      (v) =>
        v.street === street &&
        v.action.playerId !== hero &&
        (AGGRESSIVE_KINDS as readonly string[]).includes(v.action.kind),
    )
  }

  // -------------------------------------------------------------- strength ---

  /**
   * What the hero holds on a street. Undefined preflop, when the hole cards
   * were never shown, or before the flop is out.
   */
  heroHandStrength(street: StreetName): HandStrength | undefined {
    if (this.#strengthCache.has(street)) return this.#strengthCache.get(street)

    const hole = this.hero?.holeCards
    const board = this.boardAt(street)
    const value =
      hole !== undefined && hole.length === 2 && board.length >= 3
        ? describeStrength(hole, board)
        : undefined

    this.#strengthCache.set(street, value)
    return value
  }

  // -------------------------------------------------------------- showdown ---

  wentToShowdown(): boolean {
    const hero = this.hero?.playerId
    return hero !== undefined && this.#showdownScores.has(hero)
  }

  /** Every holding revealed at showdown, scored. */
  showdownScores(): ReadonlyMap<string, HandScore> {
    return this.#showdownScores
  }

  /**
   * The hero's hand was the best one shown. Distinct from winning the pot: in a
   * side-pot hand the best hand does not always take everything.
   */
  heroHadBestHandAtShowdown(): boolean {
    const hero = this.hero?.playerId
    const mine = hero === undefined ? undefined : this.#showdownScores.get(hero)
    if (mine === undefined) return false
    return [...this.#showdownScores].every(([id, score]) => id === hero || score <= mine)
  }

  /**
   * The hero collected chips from a pot. Taken from the pot winners rather than
   * from a positive net: a split pot that returns exactly what went in is still
   * a pot the hero won, and the statistics that count it would say otherwise.
   */
  heroWonPot(): boolean {
    const hero = this.hero?.playerId
    if (hero === undefined) return false
    return this.hand.results.pots.some((pot) => pot.winners.includes(hero))
  }

  /** Nobody bet on this street: it was checked through. */
  wasCheckedThrough(street: StreetName): boolean {
    const view = this.streetView(street)
    if (view === undefined) return false
    return !view.actions.some((v) => (AGGRESSIVE_KINDS as readonly string[]).includes(v.action.kind))
  }
}

function isPost(action: Action): boolean {
  return action.kind.startsWith('post-') || action.kind === 'straddle'
}

/** Chips into the pot by choice. Blinds and antes are not a decision. */
function putsMoneyIn(action: Action): boolean {
  if (isPost(action)) return false
  return action.kind === 'call' || action.kind === 'bet' || action.kind === 'raise'
}

/** Ordinal of a street, with showdown sorting after the river. */
export function streetIndex(street: StreetName): number {
  const order: readonly StreetName[] = BETTING_STREETS
  const index = order.indexOf(street)
  return index === -1 ? order.length : index
}

interface Timeline {
  streets: StreetView[]
  actions: ActionView[]
  preflopAggressor: string | undefined
}

/**
 * Replays the hand once, recording the state each action was taken against.
 *
 * The pot here includes bets that were later returned uncalled, because that is
 * the pot the player was looking at when they decided. Comparing a bet against
 * the final pot would flatter every fold.
 */
function buildTimeline(hand: Hand): Timeline {
  const stacks = new Map(hand.seats.map((s) => [s.playerId, s.stack] as const))
  const spent = new Map<string, Chips>()
  const folded = new Set<string>()
  const streets: StreetView[] = []
  const actions: ActionView[] = []

  let pot: Chips = Money.ZERO
  let preflopAggressor: string | undefined
  const boardSoFar: Card[] = []

  for (const street of hand.streets) {
    boardSoFar.push(...street.board)

    const streetCommitted = new Map<string, Chips>()
    let currentBet: Chips = Money.ZERO
    const potAtStart = pot
    const views: ActionView[] = []
    const playersAtStart = hand.seats.filter((s) => s.dealtIn && !folded.has(s.playerId)).length

    for (const action of street.actions) {
      const already = streetCommitted.get(action.playerId) ?? Money.ZERO
      const toCall = Money.max(Money.sub(currentBet, already), Money.ZERO)
      const stackSpent = spent.get(action.playerId) ?? Money.ZERO
      const stackBefore = Money.max(
        Money.sub(stacks.get(action.playerId) ?? Money.ZERO, stackSpent),
        Money.ZERO,
      )

      const isAggressive = (AGGRESSIVE_KINDS as readonly string[]).includes(action.kind)
      const committedByAction = action.toAmount ?? Money.add(already, action.contributed)

      views.push({
        action,
        street: street.name,
        potBefore: pot,
        toCall,
        playersIn: hand.seats.filter((s) => s.dealtIn && !folded.has(s.playerId)).length,
        stackBefore,
        sizeAsPotFraction: isAggressive ? Money.ratio(committedByAction, pot) : 0,
        requiredEquity: toCall === 0 ? 0 : Money.ratio(toCall, Money.add(pot, toCall)),
      })

      // Apply the action.
      pot = Money.add(pot, action.contributed)
      spent.set(action.playerId, Money.add(stackSpent, action.contributed))
      const nowCommitted = Money.add(already, action.contributed)
      streetCommitted.set(action.playerId, nowCommitted)
      if (nowCommitted > currentBet) currentBet = nowCommitted
      if (action.kind === 'fold') folded.add(action.playerId)
      if (street.name === 'preflop' && isAggressive) preflopAggressor = action.playerId
    }

    streets.push({
      name: street.name,
      board: street.board,
      boardSoFar: [...boardSoFar],
      potAtStart,
      actions: views,
      playersAtStart,
    })
    actions.push(...views)
  }

  return { streets, actions, preflopAggressor }
}

/** Scores every holding that reached showdown, so "best hand" is a comparison. */
function buildShowdownScores(hand: Hand): Map<string, HandScore> {
  const scores = new Map<string, HandScore>()
  const board = hand.streets.flatMap((s) => [...s.board])
  if (board.length < 3) return scores

  for (const entry of hand.results.showdown) {
    if (entry.cards.length !== 2) continue
    const all = [...entry.cards, ...board]
    if (all.length < 5) continue
    scores.set(entry.playerId, evaluate(all.slice(0, 7)))
  }
  return scores
}
