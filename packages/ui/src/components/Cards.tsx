/**
 * Cards, drawn rather than spelled.
 *
 * Everywhere else in this dashboard a hand is a string, because everywhere else
 * it is being read next to a number. In the trainer it is the thing being
 * looked at: you are counting suits and ranks under time pressure, and `Ah Kh`
 * does not let you do that at a glance.
 *
 * Four colours, one per suit. It is not decoration — half the exercises are
 * about noticing that four cards share a suit, and a two-colour deck makes that
 * deliberately hard.
 */

import type { JSX, ReactNode } from 'react'

const GLYPH: Record<string, string> = { c: '♣', d: '♦', h: '♥', s: '♠' }

export type CardTone = 'out' | 'dead' | 'none'

export function PlayingCard({
  card,
  size = 'md',
  tone = 'none',
  title,
}: {
  card: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  tone?: CardTone
  title?: string | undefined
}): JSX.Element {
  const rank = card[0] === 'T' ? '10' : (card[0] ?? '')
  const suit = card[1] ?? 's'
  return (
    <span
      className={`pcard ${size} suit-${suit}${tone === 'none' ? '' : ` ${tone}`}`}
      title={title}
      aria-label={card}
    >
      <b>{rank}</b>
      <i>{GLYPH[suit]}</i>
    </span>
  )
}

/** The two cards nobody has shown you, when the opponent is a range. */
export function HiddenPair({ label }: { label: string }): JSX.Element {
  return (
    <span className="hidden-pair" title={`Il suo range: ${label}`}>
      <span className="backs">
        <span className="back" />
        <span className="back" />
      </span>
      <em>{label}</em>
    </span>
  )
}

export function CardRow({
  label,
  cards,
  size = 'md',
  children,
}: {
  label: string
  cards?: readonly string[]
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children?: ReactNode
}): JSX.Element {
  return (
    <div className="card-row">
      <span className="tag-label">{label}</span>
      <div className="cards">
        {(cards ?? []).map((card) => (
          <PlayingCard key={card} card={card} size={size} />
        ))}
        {children}
      </div>
    </div>
  )
}

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS = ['s', 'h', 'd', 'c']

/**
 * The whole deck, with the outs lit up.
 *
 * This is the picture the exercise is really about: 52 cards, a handful of
 * which change the hand. Counting them in a list is arithmetic; seeing them in
 * a grid is the thing that eventually becomes instinct.
 */
export function DeckGrid({
  outs,
  known,
}: {
  outs: readonly { card: string; makes: string }[]
  known: readonly string[]
}): JSX.Element {
  const outBy = new Map(outs.map((out) => [out.card, out.makes]))
  const dead = new Set(known)

  return (
    <div className="deck-grid" role="img" aria-label={`${outs.length} carte utili su 52`}>
      {SUITS.map((suit) => (
        <div key={suit} className="deck-row">
          {RANKS.map((rank) => {
            const card = `${rank}${suit}`
            const makes = outBy.get(card)
            const tone: CardTone = makes !== undefined ? 'out' : dead.has(card) ? 'dead' : 'none'
            return (
              <PlayingCard
                key={card}
                card={card}
                size="sm"
                tone={tone}
                title={makes ?? (dead.has(card) ? 'carta già scoperta' : undefined)}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * Your answer and the right one on the same line.
 *
 * A percentage you got wrong is a number until you see it as a distance. The
 * gap between the two markers is the feedback; the number under them is just
 * the receipt.
 */
export function Gauge({
  given,
  answer,
  min,
  max,
  unit,
}: {
  given: number
  answer: number
  min: number
  max: number
  unit: string
}): JSX.Element {
  const place = (value: number): number =>
    Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))

  return (
    <div className="gauge">
      <div className="track">
        <span className="right" style={{ left: `${place(answer)}%` }} />
        <span className="mine" style={{ left: `${place(given)}%` }} />
      </div>
      <div className="gauge-legend">
        <span className="mine">
          tu: {format(given)}
          {unit}
        </span>
        <span className="right">
          giusto: {format(answer)}
          {unit}
        </span>
      </div>
    </div>
  )
}

function format(value: number): string {
  return (Math.round(value * 10) / 10).toString().replace('.', ',')
}
