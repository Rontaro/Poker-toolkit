import type { DetectionResult, Hand, ParseOptions, ParseResult, Platform, SiteAdapter } from '@poker/core'

import { detectLocale } from './detect.js'
import type { PokerStarsLocale } from './locale.js'
import { en } from './locales/en.js'
import { it } from './locales/it.js'
import { parseHand, SITE_ID } from './parse.js'
import { splitHands } from './split.js'

export const LOCALES: readonly PokerStarsLocale[] = [en, it]

export function localeFor(language: string): PokerStarsLocale | undefined {
  return LOCALES.find((l) => l.language === language)
}

export const pokerStarsAdapter: SiteAdapter<PokerStarsLocale> = {
  id: SITE_ID,
  displayName: 'PokerStars',
  locales: LOCALES,

  detect(content: string): DetectionResult {
    return detectLocale(content, LOCALES, SITE_ID)
  },

  split(content: string): string[] {
    return splitHands(content, LOCALES)
  },

  parse(raw: string, locale: PokerStarsLocale, options?: ParseOptions): ParseResult<Hand> {
    return parseHand(raw, locale, options)
  },

  defaultPaths(platform: Platform): string[] {
    if (platform === 'win32') {
      const local = process.env['LOCALAPPDATA'] ?? ''
      return [
        `${local}\\PokerStars.Italy\\HandHistory`,
        `${local}\\PokerStars.Italy\\TournSummary`,
        `${local}\\PokerStars\\HandHistory`,
        `${local}\\PokerStars\\TournSummary`,
        `${local}\\PokerStars.EU\\HandHistory`,
        `${local}\\PokerStars.EU\\TournSummary`,
      ]
    }
    if (platform === 'darwin') {
      const home = process.env['HOME'] ?? ''
      return [
        `${home}/Library/Application Support/PokerStars/HandHistory`,
        `${home}/Library/Application Support/PokerStarsEU/HandHistory`,
      ]
    }
    return []
  },
}

export { en, it }
export type { PokerStarsLocale } from './locale.js'
export { decodeText, normaliseNewlines } from './encoding.js'
export type { DetectedEncoding, DecodedText } from './encoding.js'
export { parseHand, SITE_ID } from './parse.js'
export { splitHands } from './split.js'
export { compileTemplate } from './template.js'
export { parseTimestamp } from './datetime.js'
