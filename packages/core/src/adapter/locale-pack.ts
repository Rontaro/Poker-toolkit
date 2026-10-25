import type { NumberFormat } from '../money/chips.js'

/**
 * What every locale pack must declare, whatever site it belongs to.
 *
 * The grammar of the lines themselves is site-specific — PokerStars and
 * Winamax do not share a line shape — so each adapter extends this with its
 * own dictionary. What the core needs to know is only how to read a language
 * label and how numbers and dates are written in it.
 */
export interface LocalePack {
  /** BCP 47 language subtag: `it`, `en`, `fr`. */
  readonly language: string
  readonly numberFormat: NumberFormat
  /**
   * Date layout used by the client, in `yyyy MM dd HH mm ss` field letters,
   * e.g. `dd/MM/yyyy HH:mm:ss` for the Italian client and `yyyy/MM/dd HH:mm:ss`
   * for the English one.
   */
  readonly dateFormat: string
}
