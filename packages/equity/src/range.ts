/**
 * Range notation, the shorthand a player types into a dashboard field:
 * `AA`, `AKs`, `76s-T9s`, `[AhKd, 7c7d]`. A typo here is a UI event, not a
 * program bug, so parsing collects `ParseIssue`s and never throws.
 *
 * A `Range` is just a set of canonical combo keys. Canonical means the two
 * cards of a combo are always written in the same order (higher rank first,
 * then lower suit), so `AhKd` and the pair typed in either order collapse to
 * one key and duplicates are just as easy to detect as by pointer.
 */

import {
  card,
  rankValue,
  suitOf,
  RANKS,
  SUITS,
  ok,
  fail,
  error,
  warning,
  type Card,
  type Rank,
  type ParseResult,
  type ParseIssue,
} from '@poker/core'

declare const COMBO: unique symbol
/** Two hole cards in canonical order, e.g. `AhKd`. */
export type Combo = string & { readonly [COMBO]: true }

export interface Range {
  readonly combos: ReadonlySet<Combo>
}

export const ALL_COMBO_COUNT = 1326

const RANK_INDEX: ReadonlyMap<Rank, number> = new Map(RANKS.map((r, i) => [r, i]))

/** Every card in the deck, in a fixed order. Shared with the equity engine. */
export const ALL_CARDS: readonly Card[] = RANKS.flatMap((r) => SUITS.map((s) => card(`${r}${s}`)))

/** Higher rank first; equal rank breaks by suit so pocket pairs get one order too. */
function orderPair(a: Card, b: Card): readonly [Card, Card] {
  const ra = rankValue(a)
  const rb = rankValue(b)
  if (ra !== rb) return ra > rb ? [a, b] : [b, a]
  return suitOf(a) <= suitOf(b) ? [a, b] : [b, a]
}

export function comboOf(a: Card, b: Card): Combo {
  if (a === b) throw new RangeError(`comboOf() needs two distinct cards, got ${a} twice`)
  const [hi, lo] = orderPair(a, b)
  return `${hi}${lo}` as Combo
}

export function comboCards(combo: Combo): readonly [Card, Card] {
  return [combo.slice(0, 2) as Card, combo.slice(2, 4) as Card]
}

function allCombos(): Set<Combo> {
  const combos = new Set<Combo>()
  for (let i = 0; i < ALL_CARDS.length; i += 1) {
    for (let j = i + 1; j < ALL_CARDS.length; j += 1) {
      combos.add(comboOf(ALL_CARDS[i] as Card, ALL_CARDS[j] as Card))
    }
  }
  return combos
}

type Kind = 'pair' | 'suited' | 'offsuit' | 'both'

/** A hand shape: `hi`/`lo` are rank indices (0=deuce..12=ace), `hi >= lo`. */
interface Shape {
  readonly hi: number
  readonly lo: number
  readonly kind: Kind
}

function pairCombos(rank: number): Combo[] {
  const suited = SUITS.map((s) => card(`${RANKS[rank]}${s}`))
  const out: Combo[] = []
  for (let i = 0; i < suited.length; i += 1) {
    for (let j = i + 1; j < suited.length; j += 1) {
      out.push(comboOf(suited[i] as Card, suited[j] as Card))
    }
  }
  return out
}

function suitedCombos(hi: number, lo: number): Combo[] {
  return SUITS.map((s) => comboOf(card(`${RANKS[hi]}${s}`), card(`${RANKS[lo]}${s}`)))
}

function offsuitCombos(hi: number, lo: number): Combo[] {
  const out: Combo[] = []
  for (const sHi of SUITS) {
    for (const sLo of SUITS) {
      if (sHi === sLo) continue
      out.push(comboOf(card(`${RANKS[hi]}${sHi}`), card(`${RANKS[lo]}${sLo}`)))
    }
  }
  return out
}

function combosOfShape(shape: Shape): Combo[] {
  if (shape.kind === 'pair') return pairCombos(shape.hi)
  if (shape.kind === 'suited') return suitedCombos(shape.hi, shape.lo)
  if (shape.kind === 'offsuit') return offsuitCombos(shape.hi, shape.lo)
  return [...suitedCombos(shape.hi, shape.lo), ...offsuitCombos(shape.hi, shape.lo)]
}

const SHAPE_RE = /^([2-9TJQKA])([2-9TJQKA])([so])?$/i

/** Parses a bare shape token: `AA`, `AKs`, `AKo`, or `AK` (both). No `+`/`-`. */
function parseShape(token: string): Shape | null {
  const m = SHAPE_RE.exec(token)
  if (!m) return null
  const r1 = (m[1] as string).toUpperCase() as Rank
  const r2 = (m[2] as string).toUpperCase() as Rank
  const suffix = m[3]?.toLowerCase()
  const i1 = RANK_INDEX.get(r1)
  const i2 = RANK_INDEX.get(r2)
  if (i1 === undefined || i2 === undefined) return null
  if (i1 === i2) {
    if (suffix !== undefined) return null // "AAs" is not a hand shape
    return { hi: i1, lo: i1, kind: 'pair' }
  }
  const hi = Math.max(i1, i2)
  const lo = Math.min(i1, i2)
  const kind: Kind = suffix === 's' ? 'suited' : suffix === 'o' ? 'offsuit' : 'both'
  return { hi, lo, kind }
}

const EXPLICIT_RE = /^([2-9TJQKA])([cdhs])([2-9TJQKA])([cdhs])$/i

/** Parses an explicit two-card combo token like `AhKd`. */
function parseExplicit(token: string): Combo | null {
  const m = EXPLICIT_RE.exec(token)
  if (!m) return null
  try {
    const a = card(`${m[1]}${m[2]}`)
    const b = card(`${m[3]}${m[4]}`)
    if (a === b) return null
    return comboOf(a, b)
  } catch {
    return null
  }
}

/** `77+` -> 77..AA. `ATs+` -> ATs..AKs (the kicker climbs, the top card stays). */
function expandPlus(shape: Shape): Shape[] {
  if (shape.kind === 'pair') {
    const out: Shape[] = []
    for (let r = shape.hi; r <= 12; r += 1) out.push({ hi: r, lo: r, kind: 'pair' })
    return out
  }
  const out: Shape[] = []
  for (let lo = shape.lo; lo < shape.hi; lo += 1) out.push({ hi: shape.hi, lo, kind: shape.kind })
  return out
}

/**
 * `88-JJ` -> 88..JJ. `ATs-AQs` -> the kicker ranges between the two, top card
 * fixed. `76s-T9s` -> the gap between the two ranks stays fixed (both are
 * connectors) while both ranks climb together. Anything else is not a range.
 */
function expandBetween(a: Shape, b: Shape): Shape[] | null {
  if (a.kind !== b.kind) return null
  const [low, high] = a.hi <= b.hi ? [a, b] : [b, a]

  if (a.kind === 'pair') {
    const out: Shape[] = []
    for (let r = low.hi; r <= high.hi; r += 1) out.push({ hi: r, lo: r, kind: 'pair' })
    return out
  }

  if (low.hi === high.hi) {
    const loLow = Math.min(low.lo, high.lo)
    const loHigh = Math.max(low.lo, high.lo)
    const out: Shape[] = []
    for (let l = loLow; l <= loHigh; l += 1) out.push({ hi: low.hi, lo: l, kind: a.kind })
    return out
  }

  const gapLow = low.hi - low.lo
  const gapHigh = high.hi - high.lo
  if (gapLow !== gapHigh) return null
  const out: Shape[] = []
  for (let h = low.hi; h <= high.hi; h += 1) out.push({ hi: h, lo: h - gapLow, kind: a.kind })
  return out
}

function addCombo(combos: Set<Combo>, warnings: ParseIssue[], combo: Combo, source: string): void {
  if (combos.has(combo)) {
    warnings.push(warning('duplicate-combo', `"${source}" repeats a combo already in the range`))
    return
  }
  combos.add(combo)
}

function parseToken(token: string, combos: Set<Combo>, warnings: ParseIssue[], errors: ParseIssue[]): void {
  const dash = token.indexOf('-')
  if (dash > 0) {
    const shapeA = parseShape(token.slice(0, dash))
    const shapeB = parseShape(token.slice(dash + 1))
    if (shapeA === null || shapeB === null) {
      errors.push(error('bad-range', `"${token}" is not a valid range expression`))
      return
    }
    const shapes = expandBetween(shapeA, shapeB)
    if (shapes === null) {
      errors.push(error('incompatible-range', `"${token}" mixes incompatible hand shapes`))
      return
    }
    for (const shape of shapes) for (const combo of combosOfShape(shape)) addCombo(combos, warnings, combo, token)
    return
  }

  if (token.endsWith('+') && token.length > 1) {
    const shape = parseShape(token.slice(0, -1))
    if (shape === null) {
      errors.push(error('bad-range', `"${token}" is not a valid range expression`))
      return
    }
    for (const shape2 of expandPlus(shape)) {
      for (const combo of combosOfShape(shape2)) addCombo(combos, warnings, combo, token)
    }
    return
  }

  const shape = parseShape(token)
  if (shape !== null) {
    for (const combo of combosOfShape(shape)) addCombo(combos, warnings, combo, token)
    return
  }

  const explicit = parseExplicit(token)
  if (explicit !== null) {
    addCombo(combos, warnings, explicit, token)
    return
  }

  errors.push(error('unknown-token', `"${token}" is not a valid pair, hand shape, range, or explicit combo`))
}

/** Splits top-level comma/space-separated tokens out from `[...]` combo lists. */
function splitTopLevel(input: string): { plain: string; bracketed: string[]; unterminated: boolean } {
  const bracketed: string[] = []
  let plain = ''
  let unterminated = false
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch === '[') {
      const end = input.indexOf(']', i)
      if (end === -1) {
        unterminated = true
        break
      }
      bracketed.push(input.slice(i + 1, end))
      plain += ' '
      i = end + 1
    } else {
      plain += ch
      i += 1
    }
  }
  return { plain, bracketed, unterminated }
}

export function parseRange(notation: string): ParseResult<Range> {
  const raw = notation
  const trimmed = notation.trim()
  const errors: ParseIssue[] = []
  const warnings: ParseIssue[] = []
  const combos = new Set<Combo>()

  if (trimmed === '') {
    errors.push(error('empty-range', 'Range notation is empty'))
    return fail(raw, errors, warnings)
  }

  if (/^(random|any2)$/i.test(trimmed)) {
    for (const c of allCombos()) combos.add(c)
    return ok({ combos }, warnings)
  }

  const { plain, bracketed, unterminated } = splitTopLevel(trimmed)

  for (const group of bracketed) {
    const pieces = group.split(/[,\s]+/).map((p) => p.trim()).filter((p) => p !== '')
    if (pieces.length === 0) {
      warnings.push(warning('empty-bracket', 'An empty "[...]" combo list was ignored'))
    }
    for (const piece of pieces) {
      const explicit = parseExplicit(piece)
      if (explicit === null) {
        errors.push(error('bad-combo', `"${piece}" inside brackets is not a valid two-card combo`))
        continue
      }
      addCombo(combos, warnings, explicit, piece)
    }
  }

  if (unterminated) {
    errors.push(error('unterminated-bracket', 'Unmatched "[" in range notation'))
  }

  const tokens = plain.split(/[,\s]+/).map((t) => t.trim()).filter((t) => t !== '')
  for (const token of tokens) parseToken(token, combos, warnings, errors)

  if (errors.length > 0) return fail(raw, errors, warnings)
  if (combos.size === 0) {
    errors.push(error('empty-range', 'Range notation produced no combos'))
    return fail(raw, errors, warnings)
  }
  return ok({ combos }, warnings)
}

export function combosOf(range: Range): Combo[] {
  return [...range.combos].sort()
}

function mergePairRuns(ranksIn: readonly number[]): string[] {
  const ranks = [...ranksIn].sort((a, b) => a - b)
  const out: string[] = []
  let i = 0
  while (i < ranks.length) {
    let j = i
    while (j + 1 < ranks.length && ranks[j + 1] === (ranks[j] as number) + 1) j += 1
    const lowR = ranks[i] as number
    const highR = ranks[j] as number
    const tok = (r: number): string => `${RANKS[r]}${RANKS[r]}`
    if (j > i) out.push(highR === 12 ? `${tok(lowR)}+` : `${tok(lowR)}-${tok(highR)}`)
    else out.push(tok(lowR))
    i = j + 1
  }
  return out
}

/** Merges same-top-card runs (`ATs..AKs` -> `ATs+` or `ATs-AQs`). Connector runs across
 * different top cards (`76s..T9s`) are not collapsed back — see formatRange's docstring. */
function mergeShapeRuns(keys: ReadonlySet<string>, suffix: string): string[] {
  const byHi = new Map<number, number[]>()
  for (const key of keys) {
    const [hiStr, loStr] = key.split('-')
    const hi = Number(hiStr)
    const lo = Number(loStr)
    const list = byHi.get(hi) ?? []
    list.push(lo)
    byHi.set(hi, list)
  }

  const out: string[] = []
  for (const [hi, losIn] of byHi) {
    const los = [...losIn].sort((a, b) => a - b)
    let i = 0
    while (i < los.length) {
      let j = i
      while (j + 1 < los.length && los[j + 1] === (los[j] as number) + 1) j += 1
      const loLow = los[i] as number
      const loHigh = los[j] as number
      const tok = (l: number): string => `${RANKS[hi]}${RANKS[l]}${suffix}`
      if (j > i) out.push(loHigh === hi - 1 ? `${tok(loLow)}+` : `${tok(loLow)}-${tok(loHigh)}`)
      else out.push(tok(loLow))
      i = j + 1
    }
  }
  return out
}

/**
 * Collapses a range back to compact notation. Best effort, not a full inverse
 * of parseRange: a shape only collapses when every combo of that shape is
 * present (a range with 3 of AKo's 12 combos lists them explicitly instead of
 * inventing a shape that isn't really there), and connector runs like
 * `76s-T9s` format back as the individual shapes (`76s, 87s, 98s, T9s`)
 * rather than re-detecting the run, since that pattern is rare enough not to
 * be worth the extra bookkeeping.
 */
export function formatRange(range: Range): string {
  const combos = range.combos
  if (combos.size === ALL_COMBO_COUNT) return 'random'

  const consumed = new Set<Combo>()
  const pairRanks: number[] = []
  for (let r = 0; r <= 12; r += 1) {
    const list = pairCombos(r)
    if (list.every((c) => combos.has(c))) {
      pairRanks.push(r)
      for (const c of list) consumed.add(c)
    }
  }

  const both = new Set<string>()
  const suited = new Set<string>()
  const offsuit = new Set<string>()
  for (let hi = 1; hi <= 12; hi += 1) {
    for (let lo = 0; lo < hi; lo += 1) {
      const sList = suitedCombos(hi, lo)
      const oList = offsuitCombos(hi, lo)
      const sFull = sList.every((c) => combos.has(c))
      const oFull = oList.every((c) => combos.has(c))
      const key = `${hi}-${lo}`
      if (sFull && oFull) {
        both.add(key)
        for (const c of [...sList, ...oList]) consumed.add(c)
      } else if (sFull) {
        suited.add(key)
        for (const c of sList) consumed.add(c)
      } else if (oFull) {
        offsuit.add(key)
        for (const c of oList) consumed.add(c)
      }
    }
  }

  const tokens: string[] = [
    ...mergePairRuns(pairRanks),
    ...mergeShapeRuns(both, ''),
    ...mergeShapeRuns(suited, 's'),
    ...mergeShapeRuns(offsuit, 'o'),
  ]

  for (const c of combosOf(range)) if (!consumed.has(c)) tokens.push(c)

  return tokens.join(', ')
}
