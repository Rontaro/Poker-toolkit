import { HandContext, deriveSessions, type Hand } from '@poker/core'
import { detectLeaks, type DetectOptions, type LeakEvent } from '@poker/rules'

/**
 * When the mistakes happen, rather than which ones.
 *
 * A leak rate that is flat across a session is a habit and gets fixed by
 * studying. A leak rate that doubles after a big pot, or after the two hundredth
 * hand of the night, is not a habit and studying will not touch it. Separating
 * the two is the whole point of this package.
 *
 * Everything here keys off the *local* clock the client printed, not the UTC
 * instant: "do I play worse after midnight" is a question about the player's
 * evening, not about Greenwich.
 */

export interface TimelineOptions {
  /** A pot lost bigger than this counts as a shock. */
  readonly tiltTriggerBB?: number
  /** How many hands after the shock are watched. */
  readonly tiltWindowHands?: number
  /** Width of the buckets that measure fatigue through a session. */
  readonly fatigueBucketHands?: number
  /** Window for the rolling win rate. */
  readonly rollingWindowHands?: number
  readonly detect?: DetectOptions
}

const DEFAULTS = {
  tiltTriggerBB: 30,
  tiltWindowHands: 20,
  fatigueBucketHands: 25,
  rollingWindowHands: 100,
}

export interface SessionSummary {
  readonly sessionId: string
  readonly startedAt: Date
  readonly endedAt: Date
  readonly hands: number
  readonly netBB: number
  readonly bb100: number
  readonly leaks: number
  /** Leaks per hundred hands. */
  readonly leakRate: number
}

export interface HourBucket {
  /** Hour of the local clock, 0 to 23. */
  readonly hour: number
  readonly hands: number
  readonly leaks: number
  readonly leakRate: number
  readonly netBB: number
  readonly bb100: number
}

export interface FatigueBucket {
  /** First hand number of the bucket, counting from one within a session. */
  readonly fromHand: number
  readonly toHand: number
  readonly hands: number
  readonly leaks: number
  readonly leakRate: number
  readonly netBB: number
  readonly bb100: number
}

export interface TiltReport {
  readonly triggerBB: number
  readonly windowHands: number
  /** Pots lost bigger than the trigger. */
  readonly triggers: number
  readonly handsAfterTriggers: number
  readonly leakRateAfterTriggers: number
  readonly handsElsewhere: number
  readonly baselineLeakRate: number
  /**
   * Leak rate after a shock as a multiple of the baseline. Above one means the
   * hands after a big loss go worse than the rest.
   */
  readonly ratio: number | undefined
  readonly netBBAfterTriggers: number
  readonly bb100AfterTriggers: number
  readonly bb100Elsewhere: number
}

export interface BankrollPoint {
  /** Position in the whole sample, from one. */
  readonly index: number
  readonly playedAt: Date
  readonly netBB: number
  readonly cumulativeBB: number
  /** Win rate over the trailing window, once there are enough hands for one. */
  readonly rollingBB100: number | undefined
}

export interface TimelineReport {
  readonly hands: number
  readonly sessions: readonly SessionSummary[]
  readonly byHourOfDay: readonly HourBucket[]
  readonly byHandsIntoSession: readonly FatigueBucket[]
  readonly tilt: TiltReport
  readonly bankroll: readonly BankrollPoint[]
}

interface Row {
  readonly context: HandContext
  readonly hand: Hand
  readonly leaks: number
  readonly netBB: number
  readonly sessionId: string
  readonly indexInSession: number
  readonly localHour: number
}

export async function buildTimeline(
  hands: readonly Hand[],
  options: TimelineOptions = {},
): Promise<TimelineReport> {
  const settings = { ...DEFAULTS, ...options }
  const report = await detectLeaks(hands, options.detect ?? {})

  const leaksByHand = new Map<string, LeakEvent[]>()
  for (const leak of report.events) {
    const bucket = leaksByHand.get(leak.handId)
    if (bucket === undefined) leaksByHand.set(leak.handId, [leak])
    else bucket.push(leak)
  }

  const rows = buildRows(hands, leaksByHand)

  return {
    hands: rows.length,
    sessions: summariseSessions(rows),
    byHourOfDay: bucketByHour(rows),
    byHandsIntoSession: bucketByFatigue(rows, settings.fatigueBucketHands),
    tilt: detectTilt(rows, settings.tiltTriggerBB, settings.tiltWindowHands),
    bankroll: bankrollCurve(rows, settings.rollingWindowHands),
  }
}

function buildRows(hands: readonly Hand[], leaksByHand: ReadonlyMap<string, LeakEvent[]>): Row[] {
  const byHero = new Map<string, Hand[]>()
  for (const hand of hands) {
    const hero = hand.hero ?? ''
    const bucket = byHero.get(hero)
    if (bucket === undefined) byHero.set(hero, [hand])
    else bucket.push(hand)
  }

  const placements = new Map<string, { sessionId: string; indexInSession: number }>()
  for (const [hero, heroHands] of byHero) {
    const placed = deriveSessions(
      heroHands.map((hand) => ({ id: hand.id, playedAt: hand.playedAt.getTime() })),
      hero,
    )
    for (const [id, placement] of placed) placements.set(id, placement)
  }

  return hands
    .map((hand) => {
      const context = new HandContext(hand)
      const placement = placements.get(hand.id)
      return {
        context,
        hand,
        leaks: leaksByHand.get(hand.id)?.length ?? 0,
        netBB: context.heroNetBB(),
        sessionId: placement?.sessionId ?? '',
        indexInSession: placement?.indexInSession ?? 1,
        // The hour the player saw on their own clock.
        localHour: Number(hand.playedAtLocal.slice(11, 13)),
      }
    })
    .sort((a, b) => a.hand.playedAt.getTime() - b.hand.playedAt.getTime())
}

function rate(count: number, hands: number): number {
  return hands === 0 ? 0 : (count / hands) * 100
}

function summariseSessions(rows: readonly Row[]): SessionSummary[] {
  const grouped = new Map<string, Row[]>()
  for (const row of rows) {
    const bucket = grouped.get(row.sessionId)
    if (bucket === undefined) grouped.set(row.sessionId, [row])
    else bucket.push(row)
  }

  return [...grouped.entries()]
    .map(([sessionId, sessionRows]) => {
      const times = sessionRows.map((row) => row.hand.playedAt.getTime())
      const netBB = sessionRows.reduce((sum, row) => sum + row.netBB, 0)
      const leaks = sessionRows.reduce((sum, row) => sum + row.leaks, 0)
      return {
        sessionId,
        startedAt: new Date(Math.min(...times)),
        endedAt: new Date(Math.max(...times)),
        hands: sessionRows.length,
        netBB,
        bb100: rate(netBB, sessionRows.length),
        leaks,
        leakRate: rate(leaks, sessionRows.length),
      }
    })
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
}

function bucketByHour(rows: readonly Row[]): HourBucket[] {
  const buckets = new Map<number, Row[]>()
  for (const row of rows) {
    const bucket = buckets.get(row.localHour)
    if (bucket === undefined) buckets.set(row.localHour, [row])
    else bucket.push(row)
  }

  return [...buckets.entries()]
    .map(([hour, hourRows]) => {
      const netBB = hourRows.reduce((sum, row) => sum + row.netBB, 0)
      const leaks = hourRows.reduce((sum, row) => sum + row.leaks, 0)
      return {
        hour,
        hands: hourRows.length,
        leaks,
        leakRate: rate(leaks, hourRows.length),
        netBB,
        bb100: rate(netBB, hourRows.length),
      }
    })
    .sort((a, b) => a.hour - b.hour)
}

function bucketByFatigue(rows: readonly Row[], width: number): FatigueBucket[] {
  const buckets = new Map<number, Row[]>()
  for (const row of rows) {
    const index = Math.floor((row.indexInSession - 1) / width)
    const bucket = buckets.get(index)
    if (bucket === undefined) buckets.set(index, [row])
    else bucket.push(row)
  }

  return [...buckets.entries()]
    .map(([index, bucketRows]) => {
      const netBB = bucketRows.reduce((sum, row) => sum + row.netBB, 0)
      const leaks = bucketRows.reduce((sum, row) => sum + row.leaks, 0)
      return {
        fromHand: index * width + 1,
        toHand: (index + 1) * width,
        hands: bucketRows.length,
        leaks,
        leakRate: rate(leaks, bucketRows.length),
        netBB,
        bb100: rate(netBB, bucketRows.length),
      }
    })
    .sort((a, b) => a.fromHand - b.fromHand)
}

/**
 * Compares the hands right after a painful pot with all the others.
 *
 * The window is bounded by the session: the twenty hands after a bad beat at
 * the end of a night are not the first twenty of the next one, and treating
 * them as such would smear the effect this is trying to find.
 */
function detectTilt(rows: readonly Row[], triggerBB: number, windowHands: number): TiltReport {
  const inWindow = new Array<boolean>(rows.length).fill(false)
  let triggers = 0

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] as Row
    if (row.netBB > -triggerBB) continue
    triggers += 1

    for (let j = i + 1; j <= i + windowHands && j < rows.length; j += 1) {
      const later = rows[j] as Row
      if (later.sessionId !== row.sessionId) break
      inWindow[j] = true
    }
  }

  const after = rows.filter((_, i) => inWindow[i] === true)
  const elsewhere = rows.filter((_, i) => inWindow[i] !== true)

  const afterLeaks = after.reduce((sum, row) => sum + row.leaks, 0)
  const elsewhereLeaks = elsewhere.reduce((sum, row) => sum + row.leaks, 0)
  const afterNet = after.reduce((sum, row) => sum + row.netBB, 0)
  const elsewhereNet = elsewhere.reduce((sum, row) => sum + row.netBB, 0)

  const afterRate = rate(afterLeaks, after.length)
  const baseline = rate(elsewhereLeaks, elsewhere.length)

  return {
    triggerBB,
    windowHands,
    triggers,
    handsAfterTriggers: after.length,
    leakRateAfterTriggers: afterRate,
    handsElsewhere: elsewhere.length,
    baselineLeakRate: baseline,
    // Undefined rather than Infinity: with no baseline there is no comparison
    // to make, and a chart showing "infinitely worse" helps nobody.
    ratio: baseline === 0 || after.length === 0 ? undefined : afterRate / baseline,
    netBBAfterTriggers: afterNet,
    bb100AfterTriggers: rate(afterNet, after.length),
    bb100Elsewhere: rate(elsewhereNet, elsewhere.length),
  }
}

function bankrollCurve(rows: readonly Row[], window: number): BankrollPoint[] {
  const points: BankrollPoint[] = []
  let cumulative = 0

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] as Row
    cumulative += row.netBB

    const from = Math.max(0, i + 1 - window)
    const windowRows = rows.slice(from, i + 1)
    const windowNet = windowRows.reduce((sum, entry) => sum + entry.netBB, 0)

    points.push({
      index: i + 1,
      playedAt: row.hand.playedAt,
      netBB: row.netBB,
      cumulativeBB: cumulative,
      // A rolling win rate over nine hands is noise wearing a chart's clothes.
      rollingBB100: windowRows.length < window ? undefined : rate(windowNet, windowRows.length),
    })
  }

  return points
}
