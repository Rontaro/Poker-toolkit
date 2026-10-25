import type { LocalePack, Limit, Variant } from '@poker/core'

/**
 * The PokerStars dictionary for one language.
 *
 * Everything here is data: literal strings the client prints, with
 * `{placeholders}` where values go. No regular expressions, so translating the
 * pack is the whole job of adding a language.
 */
export interface PokerStarsLocale extends LocalePack {
  /** Strings whose presence identifies this language in a file. */
  readonly detection: readonly string[]

  readonly header: {
    /** Everything before the site's hand number. */
    readonly prefixes: readonly string[]
    readonly tournamentMarker: string
    readonly levelMarker: string
    /** Separates the game description from the timestamp. */
    readonly timestampSeparator: string
  }

  /** Full-line templates matched before the `player: action` split. */
  readonly lines: {
    readonly table: readonly string[]
    readonly seat: readonly string[]
    readonly dealtTo: readonly string[]
    readonly uncalledBet: readonly string[]
    /** Split by which pot was collected, so the parser never has to infer it
     * from the order the templates happen to be listed in. */
    readonly collected: {
      readonly sidePotIndexed: readonly string[]
      readonly sidePot: readonly string[]
      readonly mainPot: readonly string[]
      readonly singlePot: readonly string[]
    }
  }

  /** Exact street markers, matched by prefix. */
  readonly streets: {
    readonly preflop: string
    readonly flop: string
    readonly turn: string
    readonly river: string
    readonly showdown: string
    readonly summary: string
  }

  /**
   * Action templates, tried in order. The text is what follows `player: ` on
   * the line. Placeholders `{amount}`, `{by}`, `{to}`, `{cards}`, `{desc}`.
   */
  readonly actions: {
    readonly fold: readonly string[]
    readonly check: readonly string[]
    readonly call: readonly string[]
    readonly bet: readonly string[]
    readonly raise: readonly string[]
    readonly postSb: readonly string[]
    readonly postBb: readonly string[]
    readonly postAnte: readonly string[]
    readonly postDead: readonly string[]
    readonly straddle: readonly string[]
    readonly show: readonly string[]
    readonly muck: readonly string[]
    readonly noShow: readonly string[]
  }

  /** Appended to an action when the player is all in. Stripped before matching. */
  readonly allInSuffixes: readonly string[]

  /** Marks a seat as present but not in the hand. Stripped before matching. */
  readonly sittingOutSuffixes: readonly string[]

  readonly summary: {
    readonly totalPot: string
    readonly mainPot: string
    readonly sidePot: string
    readonly sidePotIndexed: string
    readonly rake: string
    readonly board: string
    readonly seat: string
    readonly shown: string
    readonly mucked: string
    readonly won: string
    readonly lost: string
    readonly collected: string
    /** Position labels as they appear in the summary, which is not always the
     * same language as the action lines. */
    readonly positions: {
      readonly button: string
      readonly sb: string
      readonly bb: string
    }
  }

  /** Lines that carry no game information and are dropped without a warning. */
  readonly noise: readonly string[]

  /** Game descriptions, longest match first within each list. */
  readonly games: {
    readonly variants: readonly { readonly match: string; readonly code: string }[]
    readonly limits: readonly { readonly match: string; readonly limit: Limit }[]
  }
}

/** Combines a game code and a limit into the model's variant, `nl` + `holdem`
 * giving `nlhe`. Unknown combinations pass through as `limit-code`. */
export function toVariant(code: string, limit: Limit): Variant {
  const table: Record<string, string> = {
    'nl:holdem': 'nlhe',
    'pl:holdem': 'plhe',
    'fl:holdem': 'flhe',
    'pl:omaha': 'plo',
    'nl:omaha': 'nlo',
    'fl:omaha': 'flo',
    'pl:omaha5': 'plo5',
    'pl:omaha6': 'plo6',
  }
  return table[`${limit}:${code}`] ?? `${limit}-${code}`
}
