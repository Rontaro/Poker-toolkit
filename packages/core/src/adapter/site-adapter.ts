import type { Hand } from '../model/hand.js'
import type { ParseResult } from '../result/parse-result.js'
import type { LocalePack } from './locale-pack.js'

/** Mirrors `NodeJS.Platform` without pulling Node types into the core. */
export type Platform = 'win32' | 'darwin' | 'linux' | (string & {})

export interface DetectionResult {
  readonly matched: boolean
  /** Adapter id, set when `matched`. */
  readonly site?: string
  /** Language subtag of the locale pack that matched. */
  readonly language?: string
  /** 0..1. Lets a caller pick between adapters that both claim a file. */
  readonly confidence: number
  readonly reason?: string
}

export interface ParseOptions {
  /** Keep the original text on `hand.source.raw`. Off by default: storing every
   * hand twice costs more than re-reading the file when a hand is inspected. */
  readonly keepRaw?: boolean
}

/**
 * Everything a poker site needs to provide. Adding Winamax or GGPoker means
 * writing one of these and registering it; no existing file changes.
 *
 * `L` is the adapter's own locale pack type, so a site's parser sees its own
 * dictionary fully typed while the core only ever handles `LocalePack`.
 */
export interface SiteAdapter<L extends LocalePack = LocalePack> {
  /** Stable id, stored on every hand: `pokerstars`. */
  readonly id: string
  readonly displayName: string

  /** Every locale this adapter can read. */
  readonly locales: readonly L[]

  /** Recognises both the site and the language from a file's contents. */
  detect(content: string): DetectionResult

  /** Splits a file into individual hand texts. */
  split(content: string): string[]

  parse(raw: string, locale: L, options?: ParseOptions): ParseResult<Hand>

  /** Where this site's client writes hand histories on a given platform. */
  defaultPaths(platform: Platform): string[]
}
