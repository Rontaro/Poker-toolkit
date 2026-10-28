import type { Chips } from '@poker/core'
import type { HandFilter } from '@poker/store'

/**
 * Turns a query string's key/value pairs (or the `filter` object of a
 * `POST /study` body, which carries the same keys) into a `HandFilter`.
 *
 * Moved here from `dashboard/server/index.ts` unchanged in behaviour, so the
 * Express server and the Web Worker read a filter the same way:
 *
 * - only string values count; an empty string, a missing key, or anything
 *   that is not a string (Express's parser turns `?a=1&a=2` into an array) is
 *   ignored, as if the key were absent;
 * - `minSeats`/`maxSeats` become `tableSize`, `minBb`/`maxBb` become
 *   `stakes`, each side optional;
 * - numbers go through `Number(...)` and dates through `new Date(...)` with
 *   no further validation -- a non-numeric value reaches the store as `NaN`,
 *   exactly as it always has.
 */
export function filterFromQuery(query: Readonly<Record<string, unknown>>): HandFilter {
  const text = (key: string): string | undefined => {
    const value = query[key]
    return typeof value === 'string' && value !== '' ? value : undefined
  }
  const number = (key: string): number | undefined => {
    const value = text(key)
    return value === undefined ? undefined : Number(value)
  }

  const site = text('site')
  const hero = text('hero')
  const gameType = text('gameType')
  const minSeats = number('minSeats')
  const maxSeats = number('maxSeats')
  const minBb = number('minBb')
  const maxBb = number('maxBb')
  const from = text('from')
  const to = text('to')

  return {
    ...(site === undefined ? {} : { site }),
    ...(hero === undefined ? {} : { hero }),
    ...(gameType === undefined ? {} : { gameType: gameType as NonNullable<HandFilter['gameType']> }),
    ...(minSeats === undefined && maxSeats === undefined
      ? {}
      : {
          tableSize: {
            ...(minSeats === undefined ? {} : { min: minSeats }),
            ...(maxSeats === undefined ? {} : { max: maxSeats }),
          },
        }),
    ...(minBb === undefined && maxBb === undefined
      ? {}
      : {
          stakes: {
            // Passed through as-is, not scaled by CHIP_SCALE: that is what the
            // original Express code did, and no view sends these keys yet.
            ...(minBb === undefined ? {} : { minBb: minBb as Chips }),
            ...(maxBb === undefined ? {} : { maxBb: maxBb as Chips }),
          },
        }),
    ...(from === undefined ? {} : { from: new Date(from) }),
    ...(to === undefined ? {} : { to: new Date(to) }),
  }
}
