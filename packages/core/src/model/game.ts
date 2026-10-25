import type { Chips } from '../money/chips.js'

export type GameType = 'cash' | 'tournament' | 'sng'

/** Open union by design: a new variant is a new string plus the rules that
 * declare they apply to it, never a change here. */
export type Variant = 'nlhe' | 'plo' | 'plo5' | 'plo6' | 'stud' | 'razz' | (string & {})

export type Limit = 'nl' | 'pl' | 'fl'

export interface Stakes {
  readonly sb: Chips
  readonly bb: Chips
  readonly ante?: Chips
  /** ISO code where there is one, `CHIPS` for tournament chips, `PLAY` for play money. */
  readonly currency: string
}

export interface TournamentInfo {
  readonly siteTournamentId: string
  readonly buyIn?: Chips
  readonly fee?: Chips
  readonly currency?: string
}

export interface Game {
  readonly type: GameType
  readonly variant: Variant
  readonly limit: Limit
  readonly stakes: Stakes
  /** Blind level, tournaments only. */
  readonly level?: number
  readonly tournament?: TournamentInfo
}
