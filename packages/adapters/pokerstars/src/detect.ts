import type { DetectionResult } from '@poker/core'
import type { PokerStarsLocale } from './locale.js'
import { normaliseNewlines } from './encoding.js'

/**
 * Recognises the site and the language in one pass. Each locale scores the
 * fraction of its marker strings that appear in the file, so a file that is
 * clearly PokerStars but in an unknown language scores above zero on the site
 * and the caller can say so rather than silently mis-parsing it.
 */
export function detectLocale(
  content: string,
  locales: readonly PokerStarsLocale[],
  siteId: string,
): DetectionResult {
  // Looking at the head of the file is enough and keeps detection O(1) on a
  // 200 MB archive.
  const head = normaliseNewlines(content).slice(0, 4_000)

  let best: { locale: PokerStarsLocale; score: number } | undefined
  for (const locale of locales) {
    const hits = locale.detection.filter((marker) => head.includes(marker)).length
    const score = locale.detection.length === 0 ? 0 : hits / locale.detection.length
    if (score > 0 && (best === undefined || score > best.score)) best = { locale, score }
  }

  if (best === undefined) {
    return { matched: false, confidence: 0, reason: 'no PokerStars marker found' }
  }

  // One marker out of many is not enough to claim the file: it could be a
  // quoted line in some other program's log.
  if (best.score < 0.5) {
    return {
      matched: false,
      confidence: best.score,
      reason: `weak match for ${best.locale.language}`,
    }
  }

  return {
    matched: true,
    site: siteId,
    language: best.locale.language,
    confidence: best.score,
  }
}
