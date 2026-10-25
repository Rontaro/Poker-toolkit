import { DOT_DECIMAL } from '@poker/core'
import type { PokerStarsLocale } from '../locale.js'

/**
 * English PokerStars client.
 *
 * Every token here is taken from a real hand history file; see
 * `__fixtures__/pokerstars/en/`.
 */
export const en: PokerStarsLocale = {
  language: 'en',
  numberFormat: DOT_DECIMAL,
  dateFormat: 'yyyy/MM/dd HH:mm:ss',

  detection: ['PokerStars Hand #', 'PokerStars Game #', 'is the button', '*** HOLE CARDS ***'],

  header: {
    prefixes: ['PokerStars Hand #', 'PokerStars Zoom Hand #', 'PokerStars Game #'],
    tournamentMarker: 'Tournament #',
    levelMarker: 'Level',
    timestampSeparator: ' - ',
  },

  lines: {
    table: [
      "Table '{name}' {maxSeats}-max Seat #{seat} is the button",
      "Table '{name}' {maxSeats}-max {tail} Seat #{seat} is the button",
      "Table '{name}' Seat #{seat} is the button",
    ],
    seat: [
      'Seat {seat}: {player} ({stack} in chips, {bounty} bounty)',
      'Seat {seat}: {player} ({stack} in chips)',
    ],
    dealtTo: ['Dealt to {player} [{cards}]'],
    uncalledBet: ['Uncalled bet ({amount}) returned to {player}'],
    collected: {
      sidePotIndexed: ['{player} collected {amount} from side pot-{potIndex}'],
      sidePot: ['{player} collected {amount} from side pot'],
      mainPot: ['{player} collected {amount} from main pot'],
      singlePot: ['{player} collected {amount} from pot'],
    },
  },

  streets: {
    preflop: '*** HOLE CARDS ***',
    flop: '*** FLOP ***',
    turn: '*** TURN ***',
    river: '*** RIVER ***',
    showdown: '*** SHOW DOWN ***',
    summary: '*** SUMMARY ***',
  },

  actions: {
    fold: ['folds'],
    check: ['checks'],
    call: ['calls {amount}'],
    bet: ['bets {amount}'],
    raise: ['raises {by} to {to}'],
    postSb: ['posts small blind {amount}'],
    postBb: ['posts big blind {amount}'],
    postAnte: ['posts the ante {amount}'],
    postDead: ['posts small & big blinds {amount}'],
    straddle: [],
    show: ['shows [{cards}] ({desc})', 'shows [{cards}]'],
    muck: ['mucks hand'],
    noShow: ["doesn't show hand"],
  },

  allInSuffixes: ['and is all-in'],
  sittingOutSuffixes: ['is sitting out'],

  summary: {
    totalPot: 'Total pot {pot}',
    mainPot: 'Main pot {mainPot}',
    sidePot: 'Side pot {sidePot}',
    sidePotIndexed: 'Side pot-{potIndex} {sidePot}',
    rake: 'Rake {rake}',
    board: 'Board [{cards}]',
    seat: 'Seat {seat}: {rest}',
    shown: 'showed [{cards}]',
    mucked: 'mucked [{cards}]',
    won: 'and won',
    lost: 'and lost',
    collected: 'collected',
    positions: { button: 'button', sb: 'small blind', bb: 'big blind' },
  },

  noise: [
    'has timed out',
    'sits out',
    'is sitting out',
    'joins the table',
    'leaves the table',
    'was removed from the table',
    'is connected',
    'is disconnected',
    'has returned',
    'said,',
    'will be allowed to play after the button',
    're-buys and receives',
    'finished the tournament in',
    'wins the tournament',
  ],

  games: {
    variants: [
      { match: "Hold'em", code: 'holdem' },
      { match: 'Omaha Hi/Lo', code: 'omaha-hi-lo' },
      { match: '5 Card Omaha', code: 'omaha5' },
      { match: '6 Card Omaha', code: 'omaha6' },
      { match: 'Omaha', code: 'omaha' },
      { match: 'Razz', code: 'razz' },
      { match: '7 Card Stud', code: 'stud' },
    ],
    limits: [
      { match: 'Pot Limit', limit: 'pl' },
      { match: 'No Limit', limit: 'nl' },
      { match: 'Limit', limit: 'fl' },
    ],
  },
}
