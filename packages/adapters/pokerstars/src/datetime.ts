/**
 * Timestamps, driven by the `dateFormat` in the locale pack.
 *
 * The client prints wall-clock time plus a timezone label. We keep both: the
 * local string is what time-of-day analysis needs ("do I leak more after
 * midnight"), and the absolute instant is what sorting and session detection
 * need. The label is the client's, and PokerStars is known to print `CET`
 * year-round even during summer time, so the absolute instant can be an hour
 * off in summer while the local string is always exactly what the player saw.
 */

/** Minutes east of UTC for the labels PokerStars emits. */
const OFFSETS: Readonly<Record<string, number>> = {
  UTC: 0,
  GMT: 0,
  WET: 0,
  BST: 60,
  WEST: 60,
  CET: 60,
  CEST: 120,
  EET: 120,
  EEST: 180,
  MSK: 180,
  ET: -300,
  EST: -300,
  EDT: -240,
  CT: -360,
  CST: -360,
  CDT: -300,
  MT: -420,
  MST: -420,
  MDT: -360,
  PT: -480,
  PST: -480,
  PDT: -420,
  AET: 600,
  AEST: 600,
  AEDT: 660,
  JST: 540,
  BRT: -180,
  ART: -180,
  CCT: 480,
}

/**
 * Each field accepts one or two digits. The client does not always pad: a hand
 * played just after midnight is stamped `2026/09/05 0:00:04`, with a
 * single-digit hour, while every other hand of the same session is padded.
 */
const FIELD_PATTERNS: Readonly<Record<string, string>> = {
  yyyy: String.raw`(?<year>\d{4})`,
  MM: String.raw`(?<month>\d{1,2})`,
  dd: String.raw`(?<day>\d{1,2})`,
  HH: String.raw`(?<hour>\d{1,2})`,
  mm: String.raw`(?<minute>\d{1,2})`,
  ss: String.raw`(?<second>\d{1,2})`,
}

const FIELD_RE = /yyyy|MM|dd|HH|mm|ss/g

export interface ParsedTimestamp {
  /** `YYYY-MM-DDTHH:mm:ss`, normalised but still local wall-clock. */
  readonly local: string
  readonly timezone: string
  readonly instant: Date
  /** True when the timezone label was not recognised and UTC was assumed. */
  readonly assumedUtc: boolean
}

export class TimestampFormatError extends Error {}

function formatToRegex(format: string): RegExp {
  let source = ''
  let cursor = 0
  for (const match of format.matchAll(FIELD_RE)) {
    source += format.slice(cursor, match.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    source += FIELD_PATTERNS[match[0]] as string
    cursor = match.index + match[0].length
  }
  source += format.slice(cursor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${source}$`)
}

const regexCache = new Map<string, RegExp>()

function regexFor(format: string): RegExp {
  const hit = regexCache.get(format)
  if (hit) return hit
  const built = formatToRegex(format)
  regexCache.set(format, built)
  return built
}

/**
 * Parses `"2026/09/04 23:29:09"` with format `"yyyy/MM/dd HH:mm:ss"`, or
 * `"04/09/2026 23:02:16"` with `"dd/MM/yyyy HH:mm:ss"`.
 */
export function parseTimestamp(value: string, format: string, timezone: string): ParsedTimestamp {
  const groups = regexFor(format).exec(value.trim())?.groups
  if (!groups) {
    throw new TimestampFormatError(
      `Timestamp ${JSON.stringify(value)} does not match format ${JSON.stringify(format)}`,
    )
  }

  const year = Number(groups['year'])
  const month = Number(groups['month'])
  const day = Number(groups['day'])
  const hour = Number(groups['hour'])
  const minute = Number(groups['minute'])
  const second = Number(groups['second'])

  const pad = (n: number, width = 2): string => String(n).padStart(width, '0')
  const local = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`

  const label = timezone.trim().toUpperCase()
  const offset = OFFSETS[label]
  const assumedUtc = offset === undefined
  const utcMillis =
    Date.UTC(year, month - 1, day, hour, minute, second) - (offset ?? 0) * 60_000

  const instant = new Date(utcMillis)
  if (Number.isNaN(instant.getTime())) {
    throw new TimestampFormatError(`Timestamp ${JSON.stringify(value)} is not a real date`)
  }

  return { local, timezone: label, instant, assumedUtc }
}
