import type { HandId } from '../model/hand.js'
import { sha256Hex } from './sha256.js'

export interface HandIdInput {
  readonly site: string
  readonly siteHandId: string
  /** Table name, so a hand id reused across two tables stays distinct. */
  readonly tableName: string
  /** Local timestamp string, exactly as the client printed it. */
  readonly playedAtLocal: string
}

/**
 * Stable identity for a hand, independent of the site's own numbering.
 *
 * The inputs are the ones that never change for a given hand and that no
 * re-export can perturb. Re-importing the same file, or the same hand from a
 * second copy of the file, produces the same id, which is what makes ingest
 * deduplication work without trusting site ids to be globally unique.
 */
export function makeHandId(input: HandIdInput): HandId {
  const key = [input.site, input.siteHandId, input.tableName, input.playedAtLocal].join(' ')
  return sha256Hex(key).slice(0, 32) as HandId
}
