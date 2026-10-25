import type { PokerStarsLocale } from './locale.js'
import { normaliseNewlines } from './encoding.js'

/**
 * Cuts a file into one text per hand.
 *
 * Hands are separated by blank lines, but splitting on those is fragile: a
 * truncated file, an interrupted write, or chat lines can leave stray blanks.
 * Instead we start a new hand wherever a line opens with a known header
 * prefix, in any language, which is the one thing that is always true.
 */
export function splitHands(content: string, locales: readonly PokerStarsLocale[]): string[] {
  const prefixes = locales.flatMap((l) => l.header.prefixes)
  const lines = normaliseNewlines(content).split('\n')

  const hands: string[] = []
  let current: string[] | undefined

  for (const line of lines) {
    if (prefixes.some((prefix) => line.startsWith(prefix))) {
      if (current) hands.push(current.join('\n').trim())
      current = [line]
    } else if (current) {
      current.push(line)
    }
    // Lines before the first header are preamble and are dropped.
  }
  if (current) hands.push(current.join('\n').trim())

  return hands.filter((hand) => hand !== '')
}
