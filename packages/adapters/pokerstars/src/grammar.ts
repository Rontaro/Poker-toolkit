import type { ActionKind } from '@poker/core'
import type { PokerStarsLocale } from './locale.js'
import { compileAll, compileTemplate } from './template.js'

/** A locale pack with every template turned into a regex, built once per pack. */
export interface Grammar {
  readonly locale: PokerStarsLocale
  readonly table: readonly RegExp[]
  readonly seat: readonly RegExp[]
  readonly dealtTo: readonly RegExp[]
  readonly uncalledBet: readonly RegExp[]
  readonly collected: readonly {
    readonly kind: 'main' | 'side'
    /** 0 for the main pot, 1..n for side pots. */
    readonly defaultIndex: number
    readonly patterns: readonly RegExp[]
  }[]
  /** Action kind paired with the patterns that produce it, in priority order. */
  readonly actions: readonly { readonly kind: ActionKind; readonly patterns: readonly RegExp[] }[]
  readonly summary: {
    readonly totalPot: RegExp
    readonly mainPot: RegExp
    readonly sidePot: RegExp
    readonly sidePotIndexed: RegExp
    readonly rake: RegExp
    readonly board: RegExp
    readonly seat: RegExp
    readonly shown: RegExp
    readonly mucked: RegExp
  }
}

const cache = new WeakMap<PokerStarsLocale, Grammar>()

export function grammarFor(locale: PokerStarsLocale): Grammar {
  const cached = cache.get(locale)
  if (cached) return cached
  const built = build(locale)
  cache.set(locale, built)
  return built
}

function build(locale: PokerStarsLocale): Grammar {
  const a = locale.actions
  const unanchored = { anchored: false }

  return {
    locale,
    table: compileAll(locale.lines.table),
    seat: compileAll(locale.lines.seat),
    dealtTo: compileAll(locale.lines.dealtTo),
    uncalledBet: compileAll(locale.lines.uncalledBet),
    // Most specific first: an indexed side pot must not be read as a plain one.
    collected: [
      { kind: 'side', defaultIndex: 1, patterns: compileAll(locale.lines.collected.sidePotIndexed) },
      { kind: 'side', defaultIndex: 1, patterns: compileAll(locale.lines.collected.sidePot) },
      { kind: 'main', defaultIndex: 0, patterns: compileAll(locale.lines.collected.mainPot) },
      { kind: 'main', defaultIndex: 0, patterns: compileAll(locale.lines.collected.singlePot) },
    ],

    // Order matters: `raise` before `bet` and `call` so that a locale whose
    // words share a prefix cannot shadow the more specific form.
    actions: [
      { kind: 'post-sb', patterns: compileAll(a.postSb) },
      { kind: 'post-bb', patterns: compileAll(a.postBb) },
      { kind: 'post-ante', patterns: compileAll(a.postAnte) },
      { kind: 'post-dead', patterns: compileAll(a.postDead) },
      { kind: 'straddle', patterns: compileAll(a.straddle) },
      { kind: 'raise', patterns: compileAll(a.raise) },
      { kind: 'bet', patterns: compileAll(a.bet) },
      { kind: 'call', patterns: compileAll(a.call) },
      { kind: 'check', patterns: compileAll(a.check) },
      { kind: 'fold', patterns: compileAll(a.fold) },
      { kind: 'show', patterns: compileAll(a.show) },
      { kind: 'muck', patterns: compileAll(a.muck) },
      { kind: 'no-show', patterns: compileAll(a.noShow) },
    ],

    summary: {
      totalPot: compileTemplate(locale.summary.totalPot, unanchored),
      mainPot: compileTemplate(locale.summary.mainPot, unanchored),
      sidePot: compileTemplate(locale.summary.sidePot, unanchored),
      sidePotIndexed: compileTemplate(locale.summary.sidePotIndexed, unanchored),
      rake: compileTemplate(locale.summary.rake, unanchored),
      board: compileTemplate(locale.summary.board, unanchored),
      seat: compileTemplate(locale.summary.seat),
      shown: compileTemplate(locale.summary.shown, unanchored),
      mucked: compileTemplate(locale.summary.mucked, unanchored),
    },
  }
}
