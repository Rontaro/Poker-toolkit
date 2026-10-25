/**
 * Equity: how often each player's hand wins, ties, or loses across every
 * card-removal-legal way the rest of the deck can fall.
 *
 * Two engines share one accumulator. Below `EXHAUSTIVE_TRIAL_LIMIT` trials we
 * enumerate every combo tuple and every board runout exactly, so the result
 * is not an estimate. Above it — wide ranges with several streets still to
 * come — we Monte Carlo sample instead, with our own seeded PRNG so the same
 * spot always answers the same way.
 */

import { evaluate, type Card } from '@poker/core'
import { combosOf, comboCards, ALL_CARDS, type Combo, type Range } from './range.js'
import { mulberry32, randomInt, DEFAULT_SEED } from './rng.js'

export interface EquityInput {
  readonly players: readonly (Range | Combo)[]
  readonly board?: readonly Card[]
  readonly dead?: readonly Card[]
  readonly maxSamples?: number
  readonly seed?: number
}

export interface PlayerEquity {
  readonly win: number
  readonly tie: number
  readonly lose: number
  /** 0..1. A tie among k players counts as 1/k for each of them. */
  readonly equity: number
  readonly samples: number
  readonly exhaustive: boolean
}

export interface EquityResult {
  readonly players: readonly PlayerEquity[]
}

/**
 * Below this many (combo tuple x board runout) trials, enumerate exactly.
 * Two fixed preflop combos run every one of the 1,712,304 five-card runouts,
 * so the limit sits comfortably above that — the classic "worth enumerating
 * exactly" case — while a full 1326-combo range preflop (~2.3 billion trials
 * once multiplied out) falls through to Monte Carlo. Not user-configurable:
 * it is a performance cutover, not a modelling choice, so there is nothing
 * for a caller to legitimately tune here.
 */
export const EXHAUSTIVE_TRIAL_LIMIT = 2_000_000

/** Monte Carlo draws when the trial space is too large to enumerate. */
export const DEFAULT_MAX_SAMPLES = 100_000

const MAX_CLASH_ATTEMPTS = 200

function resolveCombos(entry: Range | Combo): Combo[] {
  return typeof entry === 'string' ? [entry] : combosOf(entry)
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1)
  return Math.round(result)
}

/** Best score wins the trial; a shared best score splits it 1/k-ways. */
function accumulate(
  scores: readonly number[],
  win: number[],
  tie: number[],
  lose: number[],
  equitySum: number[],
): void {
  let best = -Infinity
  for (const s of scores) if (s > best) best = s
  let winners = 0
  for (const s of scores) if (s === best) winners += 1
  const share = 1 / winners
  for (let p = 0; p < scores.length; p += 1) {
    if (scores[p] !== best) {
      lose[p] = (lose[p] as number) + 1
      continue
    }
    equitySum[p] = (equitySum[p] as number) + share
    if (winners === 1) win[p] = (win[p] as number) + 1
    else tie[p] = (tie[p] as number) + 1
  }
}

const EMPTY_CARDS: readonly Card[] = []

/**
 * Every k-combination of `pool`, most recent first index moving fastest.
 * Reuses one index buffer and one output buffer across the whole walk — the
 * board-runout loop this feeds runs in the hundreds of thousands for a wide
 * range on the flop, and it must not allocate per runout.
 */
function forEachCombination(pool: readonly Card[], k: number, cb: (chosen: readonly Card[]) => void): void {
  if (k === 0) {
    cb(EMPTY_CARDS)
    return
  }
  const n = pool.length
  if (k > n) return

  const idx = new Array<number>(k)
  for (let i = 0; i < k; i += 1) idx[i] = i
  const chosen = new Array<Card>(k)
  const fill = (): void => {
    for (let i = 0; i < k; i += 1) chosen[i] = pool[idx[i] as number] as Card
  }

  fill()
  cb(chosen)
  for (;;) {
    let i = k - 1
    while (i >= 0 && idx[i] === i + n - k) i -= 1
    if (i < 0) return
    idx[i] = (idx[i] as number) + 1
    for (let j = i + 1; j < k; j += 1) idx[j] = (idx[j - 1] as number) + 1
    fill()
    cb(chosen)
  }
}

function makeResult(
  win: readonly number[],
  tie: readonly number[],
  lose: readonly number[],
  equitySum: readonly number[],
  samples: number,
  exhaustive: boolean,
): EquityResult {
  const players = win.map((w, i) => ({
    win: w,
    tie: tie[i] as number,
    lose: lose[i] as number,
    equity: samples > 0 ? (equitySum[i] as number) / samples : 0,
    samples,
    exhaustive,
  }))
  return { players }
}

function runExhaustive(
  candidates: readonly (readonly Combo[])[],
  board: readonly Card[],
  cardsToCome: number,
  fixedUsed: ReadonlySet<Card>,
): EquityResult {
  const n = candidates.length
  const win = new Array<number>(n).fill(0)
  const tie = new Array<number>(n).fill(0)
  const lose = new Array<number>(n).fill(0)
  const equitySum = new Array<number>(n).fill(0)
  let samples = 0

  const tuple = new Array<Combo>(n)
  const usedByTuple = new Set<Card>()
  const handBuf = new Array<Card>(7)
  const boardBuf = new Array<Card>(5)
  const scores = new Array<number>(n)

  function backtrack(playerIndex: number): void {
    if (playerIndex === n) {
      const holePairs = tuple.map((c) => comboCards(c))
      const usedAll = new Set<Card>(fixedUsed)
      for (const [x, y] of holePairs) {
        usedAll.add(x)
        usedAll.add(y)
      }
      const pool = ALL_CARDS.filter((c) => !usedAll.has(c))

      for (let i = 0; i < board.length; i += 1) boardBuf[i] = board[i] as Card

      forEachCombination(pool, cardsToCome, (chosen) => {
        for (let k = 0; k < cardsToCome; k += 1) boardBuf[board.length + k] = chosen[k] as Card
        for (let p = 0; p < n; p += 1) {
          const [x, y] = holePairs[p] as readonly [Card, Card]
          handBuf[0] = x
          handBuf[1] = y
          handBuf[2] = boardBuf[0] as Card
          handBuf[3] = boardBuf[1] as Card
          handBuf[4] = boardBuf[2] as Card
          handBuf[5] = boardBuf[3] as Card
          handBuf[6] = boardBuf[4] as Card
          scores[p] = evaluate(handBuf)
        }
        accumulate(scores, win, tie, lose, equitySum)
        samples += 1
      })
      return
    }

    for (const combo of candidates[playerIndex] as readonly Combo[]) {
      const [x, y] = comboCards(combo)
      if (usedByTuple.has(x) || usedByTuple.has(y)) continue
      usedByTuple.add(x)
      usedByTuple.add(y)
      tuple[playerIndex] = combo
      backtrack(playerIndex + 1)
      usedByTuple.delete(x)
      usedByTuple.delete(y)
    }
  }
  backtrack(0)

  return makeResult(win, tie, lose, equitySum, samples, true)
}

function runMonteCarlo(
  candidates: readonly (readonly Combo[])[],
  board: readonly Card[],
  cardsToCome: number,
  fixedUsed: ReadonlySet<Card>,
  maxSamples: number,
  seed: number,
): EquityResult {
  const n = candidates.length
  const rng = mulberry32(seed)

  const win = new Array<number>(n).fill(0)
  const tie = new Array<number>(n).fill(0)
  const lose = new Array<number>(n).fill(0)
  const equitySum = new Array<number>(n).fill(0)

  const handBuf = new Array<Card>(7)
  const boardBuf = new Array<Card>(5)
  for (let i = 0; i < board.length; i += 1) boardBuf[i] = board[i] as Card
  const scores = new Array<number>(n)
  const holePairs = new Array<readonly [Card, Card]>(n)
  const usedCards = new Set<Card>()
  const pool: Card[] = []

  let samples = 0
  for (let trial = 0; trial < maxSamples; trial += 1) {
    usedCards.clear()
    for (const c of fixedUsed) usedCards.add(c)

    let assigned = true
    for (let p = 0; p < n; p += 1) {
      const list = candidates[p] as readonly Combo[]
      let picked: readonly [Card, Card] | undefined
      for (let attempt = 0; attempt < MAX_CLASH_ATTEMPTS; attempt += 1) {
        const combo = list[randomInt(rng, list.length)] as Combo
        const [x, y] = comboCards(combo)
        if (usedCards.has(x) || usedCards.has(y)) continue
        picked = [x, y]
        break
      }
      if (picked === undefined) {
        assigned = false
        break
      }
      holePairs[p] = picked
      usedCards.add(picked[0])
      usedCards.add(picked[1])
    }
    if (!assigned) continue // range too depleted by removal to fill this trial; skip it, don't fake a score

    pool.length = 0
    for (const c of ALL_CARDS) if (!usedCards.has(c)) pool.push(c)
    for (let k = 0; k < cardsToCome; k += 1) {
      const j = k + randomInt(rng, pool.length - k)
      const tmp = pool[k] as Card
      pool[k] = pool[j] as Card
      pool[j] = tmp
      boardBuf[board.length + k] = pool[k] as Card
    }

    for (let p = 0; p < n; p += 1) {
      const [x, y] = holePairs[p] as readonly [Card, Card]
      handBuf[0] = x
      handBuf[1] = y
      handBuf[2] = boardBuf[0] as Card
      handBuf[3] = boardBuf[1] as Card
      handBuf[4] = boardBuf[2] as Card
      handBuf[5] = boardBuf[3] as Card
      handBuf[6] = boardBuf[4] as Card
      scores[p] = evaluate(handBuf)
    }
    accumulate(scores, win, tie, lose, equitySum)
    samples += 1
  }

  return makeResult(win, tie, lose, equitySum, samples, false)
}

export function equity(input: EquityInput): EquityResult {
  const { players } = input
  const board = input.board ?? EMPTY_CARDS
  const dead = input.dead ?? EMPTY_CARDS

  if (players.length < 2) throw new RangeError('equity() needs at least two players')
  if (board.length !== 0 && board.length !== 3 && board.length !== 4 && board.length !== 5) {
    throw new RangeError(`board must have 0, 3, 4 or 5 cards, got ${board.length}`)
  }

  const fixedUsed = new Set<Card>([...board, ...dead])
  if (fixedUsed.size !== board.length + dead.length) {
    throw new RangeError('board and dead cards must not repeat a card')
  }

  const candidates = players.map((p) => resolveCombos(p))
  const filtered = candidates.map((list) =>
    list.filter((c) => {
      const [x, y] = comboCards(c)
      return !fixedUsed.has(x) && !fixedUsed.has(y)
    }),
  )
  for (let i = 0; i < filtered.length; i += 1) {
    if ((filtered[i] as Combo[]).length === 0) {
      throw new RangeError(`player ${i} has no combos left once board and dead cards are removed`)
    }
  }

  const cardsToCome = 5 - board.length
  const remainingDeckSize = 52 - board.length - dead.length - 2 * players.length
  const runoutSpace = Math.max(binomial(remainingDeckSize, cardsToCome), 1)
  const comboSpace = filtered.reduce((acc, list) => acc * list.length, 1)
  const totalSpace = comboSpace * runoutSpace

  if (totalSpace <= EXHAUSTIVE_TRIAL_LIMIT) {
    return runExhaustive(filtered, board, cardsToCome, fixedUsed)
  }

  const seed = input.seed ?? DEFAULT_SEED
  const maxSamples = input.maxSamples ?? DEFAULT_MAX_SAMPLES
  return runMonteCarlo(filtered, board, cardsToCome, fixedUsed, maxSamples, seed)
}

export type EquityOptions = Omit<EquityInput, 'players' | 'board'>

/** Reads better than `equity()` for the common one-hand-versus-a-range case. */
export function handVsRange(
  hero: Combo,
  villain: Range,
  board?: readonly Card[],
  opts?: EquityOptions,
): EquityResult {
  return equity({ players: [hero, villain], ...(board === undefined ? {} : { board }), ...opts })
}

export function rangeVsRange(a: Range, b: Range, board?: readonly Card[], opts?: EquityOptions): EquityResult {
  return equity({ players: [a, b], ...(board === undefined ? {} : { board }), ...opts })
}
