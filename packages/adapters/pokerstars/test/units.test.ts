import { describe, expect, it } from 'vitest'

import { decodeText, normaliseNewlines } from '../src/encoding.js'
import { parseTimestamp } from '../src/datetime.js'
import { compileTemplate } from '../src/template.js'
import { detectLocale } from '../src/detect.js'
import { splitHands } from '../src/split.js'
import { en } from '../src/locales/en.js'
import { it as italian } from '../src/locales/it.js'
import { readFixture } from './helpers.js'

describe('template compiler', () => {
  it('turns a plain sentence into a capturing pattern', () => {
    const pattern = compileTemplate('raises {by} to {to}')
    expect(pattern.exec('raises €0.04 to €0.06')?.groups).toEqual({ by: '€0.04', to: '€0.06' })
    expect(pattern.exec('raises 225 to 375')?.groups).toEqual({ by: '225', to: '375' })
  })

  it('escapes literal text instead of treating it as regex', () => {
    const pattern = compileTemplate('Uncalled bet ({amount}) returned to {player}')
    expect(pattern.exec('Uncalled bet (€0.14) returned to RailBird42')?.groups).toEqual({
      amount: '€0.14',
      player: 'RailBird42',
    })
  })

  it('tolerates the extra spaces PokerStars puts in headers', () => {
    expect(compileTemplate('Total pot {pot}').test('Total pot  €0.29')).toBe(true)
  })

  it('stops an amount before a trailing full stop', () => {
    const pattern = compileTemplate('Side pot {sidePot}', { anchored: false })
    expect(pattern.exec('Main pot €0.90. Side pot €1. | Rake €0.09')?.groups?.['sidePot']).toBe('€1')
  })

  it('reads Italian tokens with accents', () => {
    const pattern = compileTemplate('La puntata non vista ({amount}) è restituita a {player}')
    expect(pattern.exec('La puntata non vista (€0.62) è restituita a ButtonAbuser')?.groups).toEqual({
      amount: '€0.62',
      player: 'ButtonAbuser',
    })
  })
})

describe('timestamps', () => {
  it('reads the English layout', () => {
    const parsed = parseTimestamp('2026/09/04 23:29:09', 'yyyy/MM/dd HH:mm:ss', 'CET')
    expect(parsed.local).toBe('2026-09-04T23:29:09')
    expect(parsed.timezone).toBe('CET')
    expect(parsed.instant.toISOString()).toBe('2026-09-04T22:29:09.000Z')
    expect(parsed.assumedUtc).toBe(false)
  })

  it('reads the Italian layout, where the day comes first', () => {
    const parsed = parseTimestamp('04/09/2026 23:29:09', 'dd/MM/yyyy HH:mm:ss', 'CET')
    expect(parsed.local).toBe('2026-09-04T23:29:09')
  })

  it('does not silently mix the two layouts up', () => {
    // 09 as a day and 04 as a month would be a different evening entirely.
    const english = parseTimestamp('2026/09/04 23:29:09', 'yyyy/MM/dd HH:mm:ss', 'CET')
    const italian = parseTimestamp('04/09/2026 23:29:09', 'dd/MM/yyyy HH:mm:ss', 'CET')
    expect(english.local).toBe(italian.local)
  })

  it('accepts the unpadded hour the client writes just after midnight', () => {
    // Real data: every hand of a session is stamped `23:58:46`, and then the
    // one after midnight is stamped `0:00:04`.
    const parsed = parseTimestamp('2026/09/05 0:00:04', 'yyyy/MM/dd HH:mm:ss', 'CET')
    expect(parsed.local).toBe('2026-09-05T00:00:04')
    expect(parsed.instant.toISOString()).toBe('2026-09-04T23:00:04.000Z')
  })

  it('flags an unknown timezone rather than guessing', () => {
    expect(parseTimestamp('2026/09/04 23:29:09', 'yyyy/MM/dd HH:mm:ss', 'XYZ').assumedUtc).toBe(true)
  })

  it('throws on a timestamp that does not fit the format', () => {
    expect(() => parseTimestamp('nonsense', 'yyyy/MM/dd HH:mm:ss', 'CET')).toThrow()
  })
})

describe('encoding', () => {
  const sample = "Mano PokerStars n° 1:  Hold'em No Limit\nè in sit-out\n"

  it('strips a UTF-8 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(sample)])
    const decoded = decodeText(bytes)
    expect(decoded.encoding).toBe('utf-8-bom')
    expect(decoded.text.startsWith('Mano')).toBe(true)
  })

  it('reads plain UTF-8', () => {
    const decoded = decodeText(new TextEncoder().encode(sample))
    expect(decoded.encoding).toBe('utf-8')
    expect(decoded.text).toContain('è in sit-out')
  })

  it('falls back to windows-1252 when the bytes are not valid UTF-8', () => {
    // The same text as the legacy client would have written it: one byte per
    // character, so `è` is 0xE8 and `°` is 0xB0.
    const legacy = Uint8Array.from(
      [...sample].map((ch) => {
        const code = ch.codePointAt(0) as number
        return code < 256 ? code : 0x3f
      }),
    )
    const decoded = decodeText(legacy)
    expect(decoded.encoding).toBe('windows-1252')
    expect(decoded.text).toContain('è in sit-out')
    expect(decoded.text).toContain('n°')
  })

  it('normalises CRLF', () => {
    expect(normaliseNewlines('a\r\nb\rc\n')).toBe('a\nb\nc\n')
  })
})

describe('detection', () => {
  const locales = [en, italian]

  it('recognises the English client', () => {
    const result = detectLocale(readFixture('en', 'cash', 'fold-preflop-no-showdown.txt'), locales, 'pokerstars')
    expect(result).toMatchObject({ matched: true, site: 'pokerstars', language: 'en' })
  })

  it('recognises the Italian client', () => {
    const result = detectLocale(readFixture('it', 'cash', 'fold-preflop-no-showdown.txt'), locales, 'pokerstars')
    expect(result).toMatchObject({ matched: true, site: 'pokerstars', language: 'it' })
  })

  it('declines a file that is not a hand history', () => {
    expect(detectLocale('a shopping list\nmilk\nbread', locales, 'pokerstars').matched).toBe(false)
  })

  it('declines on a single incidental marker', () => {
    const result = detectLocale('someone pasted "is the button" into a chat log', locales, 'pokerstars')
    expect(result.matched).toBe(false)
    expect(result.confidence).toBeLessThan(0.5)
  })
})

describe('splitting', () => {
  it('finds every hand in a real session file', () => {
    const hands = splitHands(readFixture('en', 'cash', 'nl2-6max-session.txt'), [en])
    expect(hands).toHaveLength(52)
    expect(hands.every((h) => h.startsWith('PokerStars Hand #'))).toBe(true)
  })

  it('drops preamble before the first header', () => {
    const text = 'junk line\n\nPokerStars Hand #1:  x\nbody\n'
    expect(splitHands(text, [en])).toEqual(['PokerStars Hand #1:  x\nbody'])
  })

  it('splits even when the blank lines between hands are missing', () => {
    const text = 'PokerStars Hand #1:  a\nbody\nPokerStars Hand #2:  b\nbody'
    expect(splitHands(text, [en])).toHaveLength(2)
  })

  it('returns nothing for an empty file', () => {
    expect(splitHands('', [en])).toEqual([])
  })
})
