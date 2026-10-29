import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { en, pokerStarsAdapter } from '@poker/adapter-pokerstars'
import { deriveSessionIds, type Hand } from '@poker/core'
import { parseHandHistory } from '@poker/ingest/parse'
import { detectLeaks } from '@poker/rules'

import {
  DEMO_FILE,
  DEMO_HAND_COUNT,
  DEMO_SESSION_COUNT,
  HERO,
  OPPONENTS,
  generateDemoHands,
} from '../scripts/generate-demo-hands.js'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(here, '..', '..', 'adapters', 'pokerstars', '__fixtures__')

const bytes = readFileSync(DEMO_FILE)
const text = bytes.toString('utf8')
const parsed = parseHandHistory(new Uint8Array(bytes), 'sample-hands.txt')

function fixtureFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? fixtureFiles(path) : path.endsWith('.txt') ? [path] : []
  })
}

describe('the sample hands', () => {
  it('parse without a single hand quarantined, and without a warning', () => {
    expect(parsed.unrecognised).toBe(false)
    expect(parsed.quarantine).toEqual([])
    expect(parsed.hands).toHaveLength(DEMO_HAND_COUNT)

    // Warnings do not quarantine a hand, but each one is a line the parser
    // read differently from how the generator meant it.
    const warnings = pokerStarsAdapter
      .split(text)
      .flatMap((raw) => pokerStarsAdapter.parse(raw, en).warnings.map((warning) => warning.code))
    expect(warnings).toEqual([])
  })

  it('are 320 NL2 6-max cash hands over five sessions on five days', () => {
    expect(DEMO_HAND_COUNT).toBe(320)
    expect(DEMO_SESSION_COUNT).toBe(5)

    const hands = parsed.hands
    expect(new Set(hands.map((hand) => hand.hero))).toEqual(new Set([HERO]))
    expect(hands.every((hand) => hand.game.type === 'cash' && hand.table.maxSeats === 6)).toBe(true)

    const sessions = new Set(
      deriveSessionIds(hands.map((hand) => ({ id: hand.id, playedAt: hand.playedAt.getTime() })), HERO).values(),
    )
    expect(sessions.size).toBe(5)
    expect(new Set(hands.map((hand) => hand.playedAtLocal.slice(0, 10))).size).toBe(6) // one runs past midnight
  })

  it('name nobody but the invented players, and share nothing with the real fixtures', () => {
    const names = new Set(parsed.hands.flatMap((hand: Hand) => hand.seats.map((seat) => seat.playerId)))
    for (const name of names) expect([HERO, ...OPPONENTS]).toContain(name)

    // Screen names are compared whole (the synthetic fixtures' `Hero` is not
    // `DemoHero`); table names, hand ids and the ADM ID must not appear at all.
    const fixtureNames = new Set(['Hero99', 'RailBird42', 'NitFish07', 'ChipLeader3', 'CallStation5', 'ButtonAbuser'])
    const fixtureTokens = new Set<string>()
    for (const file of fixtureFiles(FIXTURES)) {
      const content = readFileSync(file, 'utf8')
      for (const match of content.matchAll(/^Seat \d+: (.+?) \(.+ in chips/gm)) fixtureNames.add(match[1] as string)
      for (const match of content.matchAll(/^Table '([^']+)'/gm)) fixtureTokens.add(match[1] as string)
      for (const match of content.matchAll(/Hand #(\d+)/g)) fixtureTokens.add(match[1] as string)
      for (const match of content.matchAll(/\[ADM ID: ([^\]]+)\]/g)) fixtureTokens.add(match[1] as string)
    }
    expect(fixtureNames.size).toBeGreaterThan(10)
    expect(fixtureTokens.size).toBeGreaterThan(10)
    for (const name of fixtureNames) expect(names.has(name), name).toBe(false)
    for (const token of fixtureTokens) expect(text, token).not.toContain(token)
  })

  it('are exactly what the generator writes: change it, then regenerate', () => {
    expect(generateDemoHands()).toBe(text)
  })

  it('carry leaks for the Leak tab to find', async () => {
    const report = await detectLeaks(parsed.hands)
    const fired = report.byRule.map((summary) => summary.ruleId)
    expect(fired).toEqual(expect.arrayContaining(['open-limp', 'small-open', 'min-bet']))
    expect(report.totalCostBB).toBeGreaterThan(0)
  })

  it('have a bit of everything: showdowns won and lost, all-ins, 3-bets', () => {
    const hands = parsed.hands
    const heroNet = (hand: Hand): number => (hand.results.net[HERO] ?? 0) as number
    const showdowns = hands.filter((hand) => hand.results.showdown.some((entry) => entry.playerId === HERO))
    expect(showdowns.filter((hand) => heroNet(hand) > 0).length).toBeGreaterThan(5)
    expect(showdowns.filter((hand) => heroNet(hand) < 0).length).toBeGreaterThan(5)

    const actions = hands.flatMap((hand) => hand.streets.flatMap((street) => street.actions))
    expect(actions.some((action) => action.isAllIn)).toBe(true)
    expect(hands.some((hand) => hand.results.pots.length > 1)).toBe(true)
    const threeBets = hands.filter(
      (hand) => (hand.streets[0]?.actions.filter((action) => action.kind === 'raise').length ?? 0) >= 2,
    )
    expect(threeBets.length).toBeGreaterThan(5)
  })
})
