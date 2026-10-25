/**
 * Money as integers, never floats.
 *
 * A `Chips` value is an integer count of *chip units*, where one currency unit
 * (1 EUR, 1 USD, 1 tournament chip) is `CHIP_SCALE` units. The scale is fixed
 * for the whole toolkit so values are directly comparable without carrying a
 * scale around; 4 decimal places is enough for micro cash (EUR 0.005 rake
 * fragments) and leaves room for tournament stacks up to ~9e11 chips before
 * losing integer safety.
 */

declare const CHIPS: unique symbol

export type Chips = number & { readonly [CHIPS]: true }

/** Chip units per currency unit. */
export const CHIP_SCALE = 10_000

export const ZERO = 0 as Chips

/** Separators used when reading/writing decimal amounts for a given locale. */
export interface NumberFormat {
  readonly decimal: string
  readonly thousands: string
}

export const DOT_DECIMAL: NumberFormat = { decimal: '.', thousands: ',' }

/** Wraps a raw integer count of chip units. Throws on non-integers: a caller
 * producing a fractional unit has a bug, and we want it loud at the source. */
export function chips(units: number): Chips {
  if (!Number.isSafeInteger(units)) {
    throw new TypeError(`Chips must be a safe integer number of units, got ${units}`)
  }
  // Collapse negative zero: it compares equal with `===` but not with
  // `Object.is`, which is exactly the kind of difference that shows up as a
  // baffling test failure rather than as a bug.
  return (units === 0 ? 0 : units) as Chips
}

/** Builds from a whole currency amount, e.g. `fromUnits(2)` for 2 EUR. */
export function fromUnits(currencyUnits: number): Chips {
  return chips(Math.round(currencyUnits * CHIP_SCALE))
}

export class AmountFormatError extends Error {}

/**
 * Parses a decimal amount from text without ever going through a float.
 * Accepts an optional leading currency symbol and locale separators:
 * `"EUR 1.234,56"`, `"$0.05"`, `"1500"`, `"-0.02"`.
 */
export function fromDecimalString(input: string, format: NumberFormat = DOT_DECIMAL): Chips {
  const cleaned = input
    .replace(/[\p{Sc}]/gu, '')
    .replace(/[A-Za-z\s ]/g, '')
    .split(format.thousands)
    .join('')
    .trim()

  if (cleaned === '') throw new AmountFormatError(`Empty amount: ${JSON.stringify(input)}`)

  const negative = cleaned.startsWith('-')
  const body = negative ? cleaned.slice(1) : cleaned
  const parts = body.split(format.decimal)
  if (parts.length > 2) {
    throw new AmountFormatError(`Malformed amount: ${JSON.stringify(input)}`)
  }

  const whole = parts[0] ?? ''
  const frac = parts[1] ?? ''
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac) || whole + frac === '') {
    throw new AmountFormatError(`Malformed amount: ${JSON.stringify(input)}`)
  }
  if (frac.length > decimalPlaces()) {
    throw new AmountFormatError(
      `Amount ${JSON.stringify(input)} has more than ${decimalPlaces()} decimal places`,
    )
  }

  const padded = frac.padEnd(decimalPlaces(), '0')
  const units = Number(whole === '' ? '0' : whole) * CHIP_SCALE + Number(padded === '' ? '0' : padded)
  return chips(negative ? -units : units)
}

function decimalPlaces(): number {
  return Math.log10(CHIP_SCALE)
}

export function add(a: Chips, b: Chips): Chips {
  return chips(a + b)
}

export function sub(a: Chips, b: Chips): Chips {
  return chips(a - b)
}

export function sum(values: readonly Chips[]): Chips {
  let acc = 0
  for (const v of values) acc += v
  return chips(acc)
}

/** Multiplies by an integer count (e.g. "three big blinds"). */
export function times(a: Chips, factor: number): Chips {
  if (!Number.isInteger(factor)) {
    throw new TypeError(`times() takes an integer factor, got ${factor}; use scaleBy() for fractions`)
  }
  return chips(a * factor)
}

/** Multiplies by the rational `numerator/denominator`, rounding half away from
 * zero. Used for things like "40% of the pot" without touching floats. */
export function scaleBy(a: Chips, numerator: number, denominator: number): Chips {
  if (denominator === 0) throw new RangeError('scaleBy() denominator must not be zero')
  const raw = (a * numerator) / denominator
  return chips(Math.sign(raw) * Math.round(Math.abs(raw)))
}

export function negate(a: Chips): Chips {
  return chips(-a)
}

export function abs(a: Chips): Chips {
  return chips(Math.abs(a))
}

export function max(a: Chips, b: Chips): Chips {
  return a >= b ? a : b
}

export function min(a: Chips, b: Chips): Chips {
  return a <= b ? a : b
}

export function compare(a: Chips, b: Chips): number {
  return a === b ? 0 : a < b ? -1 : 1
}

export function isZero(a: Chips): boolean {
  return a === 0
}

export function isPositive(a: Chips): boolean {
  return a > 0
}

/**
 * The unitless ratio `a / b`. This is the one place a float appears, and only
 * because ratios (pot percentages, equity) are dimensionless analysis output,
 * never balances. Returns 0 when `b` is zero.
 */
export function ratio(a: Chips, b: Chips): number {
  return b === 0 ? 0 : a / b
}

/**
 * Normalises an amount to big blinds. Every metric works in bb so that cash
 * and tournaments are comparable. The result is a plain number by design.
 */
export function toBigBlinds(amount: Chips, bigBlind: Chips): number {
  return bigBlind === 0 ? 0 : amount / bigBlind
}

export function fromBigBlinds(bb: number, bigBlind: Chips): Chips {
  return chips(Math.round(bb * bigBlind))
}

export function toDecimalString(a: Chips, minDecimals = 2): string {
  const negative = a < 0
  const units = Math.abs(a)
  const whole = Math.floor(units / CHIP_SCALE)
  const frac = String(units % CHIP_SCALE).padStart(decimalPlaces(), '0')
  const trimmed = frac.replace(/0+$/, '')
  const shown = trimmed.padEnd(minDecimals, '0')
  const body = shown === '' ? String(whole) : `${whole}.${shown}`
  return negative ? `-${body}` : body
}

/** Exact integer value, for storage. */
export function toUnits(a: Chips): number {
  return a
}
