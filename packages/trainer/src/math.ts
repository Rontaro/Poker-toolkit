/**
 * The four bits of arithmetic that decide most hands.
 *
 * All of them are one division. What makes them hard at the table is not the
 * division, it is knowing which number goes on top — so each one here is
 * written with the pot convention it assumes spelled out, and the drills quote
 * that convention back in the question text. A formula you have to guess the
 * inputs of is a formula you will get backwards under pressure.
 */

/**
 * The share of the time you need the best hand for a call to break even.
 *
 * `pot` is what is in the middle **including** the bet you are facing, `toCall`
 * is what it costs you. You risk `toCall` to win `pot`.
 */
export function requiredEquity(pot: number, toCall: number): number {
  if (toCall <= 0) return 0
  return toCall / (pot + toCall)
}

/** The same thing said the other way: `3,5 : 1` means you win 3.5 to risk 1. */
export function potOddsRatio(pot: number, toCall: number): string {
  if (toCall <= 0) return '—'
  return `${(Math.round((pot / toCall) * 10) / 10).toString().replace('.', ',')} : 1`
}

/**
 * How often a bluff has to win the pot straight away to be free.
 *
 * `pot` is the pot **before** your bet. You risk `bet` to win `pot`.
 */
export function breakEvenBluff(pot: number, bet: number): number {
  if (bet <= 0) return 0
  return bet / (pot + bet)
}

/**
 * Minimum defence frequency: the share of your range you have to go on with so
 * that betting any two cards is not automatically profitable for the opponent.
 * `pot` is the pot before his bet. It is the complement of his break-even
 * point, which is the whole idea — you defend exactly enough to make his bluff
 * indifferent.
 */
export function minimumDefence(pot: number, bet: number): number {
  if (bet <= 0) return 1
  return pot / (pot + bet)
}

/** Rounds to `step`, so a generated pot is 12,5 bb and not 12,4713 bb. */
export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}
