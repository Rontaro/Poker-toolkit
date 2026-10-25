/**
 * Turns the plain strings in a locale pack into regular expressions.
 *
 * Locale files contain no regex syntax: a line is written the way the client
 * prints it, with `{placeholders}` where values appear. Adding a language means
 * translating strings, not authoring patterns.
 *
 *   'raises {by} to {to}'  ->  /^raises +(?<by>…) +to +(?<to>…)$/u
 */

/** An amount, with or without a currency symbol: `€0.01`, `1,234.56`, `1500`. */
const AMOUNT = String.raw`[\p{Sc}]?\d+(?:[.,]\d+)*`

/**
 * How each placeholder name is matched. Anything not listed falls back to a
 * lazy `.+?`, which is right for free text bounded by literals on both sides.
 */
const PLACEHOLDERS: Readonly<Record<string, string>> = {
  amount: AMOUNT,
  by: AMOUNT,
  to: AMOUNT,
  stack: AMOUNT,
  sb: AMOUNT,
  bb: AMOUNT,
  ante: AMOUNT,
  rake: AMOUNT,
  pot: AMOUNT,
  mainPot: AMOUNT,
  sidePot: AMOUNT,
  bounty: AMOUNT,
  buyIn: AMOUNT,
  fee: AMOUNT,
  seat: String.raw`\d+`,
  maxSeats: String.raw`\d+`,
  level: String.raw`\d+`,
  potIndex: String.raw`\d+`,
  id: String.raw`\d+`,
  // Card lists live inside brackets, so anything but a closing bracket.
  cards: String.raw`[^\]]*`,
  // The site's own hand description, always inside parentheses.
  desc: String.raw`[^)]*`,
  rest: '.*',
  tail: '.*',
}

const PLACEHOLDER_RE = /\{(\w+)\}/g

function escapeLiteral(text: string): string {
  // Escape regex metacharacters, then let any run of spaces absorb the extra
  // spacing PokerStars sprinkles into its headers.
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +/g, ' +')
}

export interface CompileOptions {
  /** Anchor to the whole line. Off for templates used as substring probes. */
  readonly anchored?: boolean
}

export function compileTemplate(template: string, options: CompileOptions = {}): RegExp {
  let source = ''
  let cursor = 0

  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const name = match[1] as string
    source += escapeLiteral(template.slice(cursor, match.index))
    source += `(?<${name}>${PLACEHOLDERS[name] ?? '.+?'})`
    cursor = match.index + match[0].length
  }
  source += escapeLiteral(template.slice(cursor))

  const anchored = options.anchored ?? true
  return new RegExp(anchored ? `^${source}$` : source, 'u')
}

export function compileAll(templates: readonly string[], options?: CompileOptions): RegExp[] {
  return templates.map((t) => compileTemplate(t, options))
}

/** First pattern that matches, with its named groups. */
export function matchAny(
  patterns: readonly RegExp[],
  text: string,
): Record<string, string> | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match) return match.groups ?? {}
  }
  return undefined
}
