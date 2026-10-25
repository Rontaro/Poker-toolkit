import { Money, type Chips, type Game, type Limit, type Stakes, type TournamentInfo } from '@poker/core'
import type { IssueLog } from '@poker/core'
import type { PokerStarsLocale } from './locale.js'
import { toVariant } from './locale.js'
import { parseTimestamp, type ParsedTimestamp } from './datetime.js'

export interface HeaderInfo {
  readonly siteHandId: string
  readonly game: Game
  readonly timestamp: ParsedTimestamp
}

const CURRENCY_BY_SYMBOL: Readonly<Record<string, string>> = {
  '€': 'EUR',
  $: 'USD',
  '£': 'GBP',
  '¥': 'JPY',
}

const TRAILING_MIRROR = /\[[^\]]*\]\s*$/
const PARENTHESISED = /\(([^()]*)\)/g
const BUY_IN = /^([\p{Sc}]?[\d.,]+)\+([\p{Sc}]?[\d.,]+)(?:\+([\p{Sc}]?[\d.,]+))?(?:\s+([A-Z]{3}))?\s*/u
const ROMAN = /^[IVXLCDM]+$/

/** Header line: site hand id, game, stakes and timestamp. Returns undefined
 * when the line is not a header at all, so the caller can report it. */
export function parseHeaderLine(
  line: string,
  locale: PokerStarsLocale,
  log: IssueLog,
): HeaderInfo | undefined {
  const prefix = locale.header.prefixes.find((p) => line.startsWith(p))
  if (prefix === undefined) return undefined

  const afterPrefix = line.slice(prefix.length)
  const colon = afterPrefix.indexOf(':')
  if (colon === -1) {
    log.fail('header-malformed', 'Header has no colon after the hand number', { line: 1, text: line })
    return undefined
  }

  const siteHandId = afterPrefix.slice(0, colon).trim()
  if (!/^\d+$/.test(siteHandId)) {
    log.fail('header-malformed', `Hand number ${JSON.stringify(siteHandId)} is not numeric`, {
      line: 1,
      text: line,
    })
    return undefined
  }

  const rest = afterPrefix.slice(colon + 1).trim()
  const separator = locale.header.timestampSeparator
  const split = rest.lastIndexOf(separator)
  if (split === -1) {
    log.fail('header-malformed', 'Header has no timestamp separator', { line: 1, text: line })
    return undefined
  }

  const description = rest.slice(0, split).trim()
  const timestamp = readTimestamp(rest.slice(split + separator.length), locale, log)
  if (timestamp === undefined) return undefined

  const game = readGame(description, locale, log)
  if (game === undefined) return undefined

  return { siteHandId, game, timestamp }
}

function readTimestamp(
  text: string,
  locale: PokerStarsLocale,
  log: IssueLog,
): ParsedTimestamp | undefined {
  // The client mirrors the time in Eastern Time inside brackets; drop it.
  const stamp = text.replace(TRAILING_MIRROR, '').trim()
  const parts = /^(.*\S)\s+(\S+)$/.exec(stamp)
  if (parts === null) {
    log.fail('header-timestamp', `Cannot read a timestamp from ${JSON.stringify(stamp)}`, { line: 1 })
    return undefined
  }

  try {
    const parsed = parseTimestamp(parts[1] as string, locale.dateFormat, parts[2] as string)
    if (parsed.assumedUtc) {
      log.warn('unknown-timezone', `Unknown timezone ${parsed.timezone}, assuming UTC`, { line: 1 })
    }
    return parsed
  } catch (cause) {
    log.fail('header-timestamp', (cause as Error).message, { line: 1, text: stamp })
    return undefined
  }
}

function readGame(description: string, locale: PokerStarsLocale, log: IssueLog): Game | undefined {
  return description.includes(locale.header.tournamentMarker)
    ? readTournamentGame(description, locale, log)
    : readCashGame(description, locale, log)
}

function readCashGame(
  description: string,
  locale: PokerStarsLocale,
  log: IssueLog,
): Game | undefined {
  const match = findStakesGroup(description)
  if (match === undefined) {
    log.fail('header-stakes', 'Cash header has no stakes in parentheses', { line: 1, text: description })
    return undefined
  }

  const stakes = readStakes(match.inner, locale, log)
  if (stakes === undefined) return undefined

  const gameText = description.slice(0, match.index).trim()
  const { limit, variant } = readGameKind(gameText, locale, log)

  return { type: 'cash', variant, limit, stakes }
}

function readTournamentGame(
  description: string,
  locale: PokerStarsLocale,
  log: IssueLog,
): Game | undefined {
  // "Tournament #123, €0.91+€0.09 EUR Hold'em No Limit - Level I (10/20)"
  const segments = description.split(locale.header.timestampSeparator)
  const head = (segments[0] ?? '').trim()
  const levelPart = segments.slice(1).join(locale.header.timestampSeparator).trim()

  const markerAt = head.indexOf(locale.header.tournamentMarker)
  const afterMarker = head.slice(markerAt + locale.header.tournamentMarker.length)
  const comma = afterMarker.indexOf(',')
  const siteTournamentId = (comma === -1 ? afterMarker : afterMarker.slice(0, comma)).trim()

  let remainder = (comma === -1 ? '' : afterMarker.slice(comma + 1)).trim()

  let tournament: TournamentInfo = { siteTournamentId }
  const buyIn = BUY_IN.exec(remainder)
  if (buyIn !== null) {
    const currency = buyIn[4] ?? currencyOf(buyIn[1] as string) ?? 'EUR'
    const amounts = readAmountPair(buyIn[1] as string, buyIn[2] as string, locale, log)
    if (amounts) {
      tournament = { siteTournamentId, buyIn: amounts[0], fee: amounts[1], currency }
    }
    remainder = remainder.slice(buyIn[0].length).trim()
  } else {
    // Freerolls and tickets carry a word instead of a price.
    const firstSpace = remainder.indexOf(' ')
    if (firstSpace !== -1 && !/^[A-Za-z]*'/.test(remainder)) {
      remainder = remainder.slice(firstSpace + 1).trim()
    }
  }

  const { limit, variant } = readGameKind(remainder, locale, log)
  const blinds = findStakesGroup(levelPart)
  const stakes = blinds
    ? readStakes(blinds.inner, locale, log, 'CHIPS')
    : undefined

  if (stakes === undefined) {
    log.fail('header-stakes', 'Tournament header has no blind level', { line: 1, text: description })
    return undefined
  }

  const level = readLevel(levelPart, locale)
  return {
    type: 'tournament',
    variant,
    limit,
    stakes,
    tournament,
    ...(level === undefined ? {} : { level }),
  }
}

/**
 * The blinds are the last parenthesised group that reads like a pair, which is
 * not the same as the last group on the line: the Italian client appends the
 * regulator's licence id in brackets after it, and a table name can contain
 * parentheses of its own.
 */
function findStakesGroup(text: string): { inner: string; index: number } | undefined {
  let found: { inner: string; index: number } | undefined
  for (const match of text.matchAll(PARENTHESISED)) {
    const inner = match[1] as string
    if (inner.includes('/')) found = { inner, index: match.index }
  }
  return found
}

function readStakes(
  inner: string,
  locale: PokerStarsLocale,
  log: IssueLog,
  fallbackCurrency = 'EUR',
): Stakes | undefined {
  // "€0.01/€0.02 EUR", "10/20", "500/1000 (ante 50)"
  const parts = /^\s*([^/\s]+)\s*\/\s*([^\s)]+)(?:\s+([A-Za-z]{3}))?/.exec(inner)
  if (parts === null) {
    log.fail('header-stakes', `Cannot read blinds from ${JSON.stringify(inner)}`, { line: 1 })
    return undefined
  }

  const pair = readAmountPair(parts[1] as string, parts[2] as string, locale, log)
  if (pair === undefined) return undefined

  const currency = parts[3] ?? currencyOf(parts[1] as string) ?? fallbackCurrency
  return { sb: pair[0], bb: pair[1], currency }
}

function readAmountPair(
  first: string,
  second: string,
  locale: PokerStarsLocale,
  log: IssueLog,
): [Chips, Chips] | undefined {
  try {
    return [
      Money.fromDecimalString(first, locale.numberFormat),
      Money.fromDecimalString(second, locale.numberFormat),
    ]
  } catch (cause) {
    log.fail('header-stakes', (cause as Error).message, { line: 1 })
    return undefined
  }
}

function currencyOf(amount: string): string | undefined {
  const symbol = amount.trim().charAt(0)
  return CURRENCY_BY_SYMBOL[symbol]
}

function readGameKind(
  gameText: string,
  locale: PokerStarsLocale,
  log: IssueLog,
): { limit: Limit; variant: string } {
  const limitEntry = locale.games.limits.find((l) => gameText.includes(l.match))
  const variantEntry = locale.games.variants.find((v) => gameText.includes(v.match))

  if (limitEntry === undefined || variantEntry === undefined) {
    log.warn('unknown-game', `Unrecognised game ${JSON.stringify(gameText)}`, { line: 1 })
  }

  const limit = limitEntry?.limit ?? 'nl'
  const code = variantEntry?.code ?? 'holdem'
  return { limit, variant: toVariant(code, limit) }
}

function readLevel(levelPart: string, locale: PokerStarsLocale): number | undefined {
  const marker = locale.header.levelMarker
  const at = levelPart.indexOf(marker)
  if (at === -1) return undefined
  const token = levelPart.slice(at + marker.length).trim().split(/[\s(]/)[0]
  if (token === undefined || token === '') return undefined
  if (/^\d+$/.test(token)) return Number(token)
  return ROMAN.test(token) ? romanToNumber(token) : undefined
}

const ROMAN_VALUES: Readonly<Record<string, number>> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
}

export function romanToNumber(roman: string): number {
  let total = 0
  for (let i = 0; i < roman.length; i += 1) {
    const value = ROMAN_VALUES[roman[i] as string] ?? 0
    const next = ROMAN_VALUES[roman[i + 1] as string] ?? 0
    total += value < next ? -value : value
  }
  return total
}
