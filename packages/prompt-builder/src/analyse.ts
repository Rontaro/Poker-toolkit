import { HandContext, deriveSessions, type Hand } from '@poker/core'
import { detectLeaks, type DetectOptions, type LeakEvent, type LeakReport } from '@poker/rules'

/** One hand with everything the selectors and the renderer need about it. */
export interface AnalysedHand {
  readonly context: HandContext
  readonly leaks: readonly LeakEvent[]
  readonly sessionId: string
  /** 1 for the first hand of the sitting: "hand 12 of the session". */
  readonly indexInSession: number
  /** Sum of what this hand's leaks are estimated to have cost, in bb. */
  readonly leakCostBB: number
}

export interface AnalysedSample {
  readonly hands: readonly AnalysedHand[]
  readonly report: LeakReport
}

/**
 * Turns raw hands into the shape the prompt builder works in: context, leaks,
 * and where each hand sat in its session.
 *
 * This materialises the whole sample rather than streaming it, unlike metrics
 * and rules. That is deliberate: selecting the five biggest losses out of a
 * sample means having seen all of it, and the samples a person actually studies
 * are sessions, not databases.
 */
export async function analyse(
  hands: readonly Hand[],
  options: DetectOptions = {},
): Promise<AnalysedSample> {
  const report = await detectLeaks(hands, options)

  const byHand = new Map<string, LeakEvent[]>()
  for (const leak of report.events) {
    const bucket = byHand.get(leak.handId)
    if (bucket === undefined) byHand.set(leak.handId, [leak])
    else bucket.push(leak)
  }

  // Sessions are per hero: two players' hands in one file are two timelines.
  const placements = new Map<string, { sessionId: string; indexInSession: number }>()
  const byHero = new Map<string, Hand[]>()
  for (const hand of hands) {
    const hero = hand.hero ?? ''
    const bucket = byHero.get(hero)
    if (bucket === undefined) byHero.set(hero, [hand])
    else bucket.push(hand)
  }
  for (const [hero, heroHands] of byHero) {
    const placed = deriveSessions(
      heroHands.map((hand) => ({ id: hand.id, playedAt: hand.playedAt.getTime() })),
      hero,
    )
    for (const [id, placement] of placed) placements.set(id, placement)
  }

  const analysed = hands.map((hand) => {
    const leaks = byHand.get(hand.id) ?? []
    const placement = placements.get(hand.id)
    return {
      context: new HandContext(hand),
      leaks,
      sessionId: placement?.sessionId ?? '',
      indexInSession: placement?.indexInSession ?? 1,
      leakCostBB: leaks.reduce((sum, leak) => sum + leak.costBB, 0),
    }
  })

  return { hands: analysed, report }
}
