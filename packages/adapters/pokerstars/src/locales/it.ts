import { DOT_DECIMAL } from '@poker/core'
import type { PokerStarsLocale } from '../locale.js'

/**
 * Italian PokerStars client (PokerStars.it).
 *
 * Tokens marked UNVERIFIED are not present in any hand history we have on
 * disk: the sample we were given covers cash play up to the summary, but not
 * antes, tournaments, side pots or mucked hands. They are best-effort
 * translations and should be corrected against a real file before trusting
 * Italian imports of those situations. Everything else is copied verbatim from
 * a real PokerStars.it history.
 *
 * A wrong token here is loud, not silent: an unrecognised line becomes a parse
 * warning, and the pot arithmetic cross-check turns a missed action into an
 * error that quarantines the hand.
 */
export const it: PokerStarsLocale = {
  language: 'it',
  numberFormat: DOT_DECIMAL,
  dateFormat: 'dd/MM/yyyy HH:mm:ss',

  detection: ['Mano PokerStars n°', '*** CARTE COPERTE ***', 'Il bottone è al posto'],

  header: {
    prefixes: ['Mano PokerStars n° ', 'Mano PokerStars Zoom n° '],
    tournamentMarker: 'Torneo n° ', // UNVERIFIED
    levelMarker: 'Livello', // UNVERIFIED
    timestampSeparator: ' - ',
  },

  lines: {
    table: [
      "Tavolo '{name}' {maxSeats}-max Il bottone è al posto {seat}",
      "Tavolo '{name}' {maxSeats}-max {tail} Il bottone è al posto {seat}",
      "Tavolo '{name}' Il bottone è al posto {seat}",
    ],
    seat: [
      'Posto {seat}: {player} ({stack} chips, {bounty} taglia)', // UNVERIFIED
      'Posto {seat}: {player} ({stack} chips)',
    ],
    dealtTo: ['Distribuite a {player} [{cards}]'],
    uncalledBet: ['La puntata non vista ({amount}) è restituita a {player}'],
    collected: {
      // UNVERIFIED: side and main pot wording has no sample on disk.
      sidePotIndexed: ['{player} ha raccolto {amount} dal piatto laterale-{potIndex}'],
      sidePot: ['{player} ha raccolto {amount} dal piatto laterale'],
      mainPot: ['{player} ha raccolto {amount} dal piatto principale'],
      singlePot: ['{player} ha raccolto {amount} dal piatto'],
    },
  },

  streets: {
    preflop: '*** CARTE COPERTE ***',
    flop: '*** FLOP ***',
    turn: '*** TURN ***',
    river: '*** RIVER ***',
    showdown: '*** SHOW DOWN ***',
    summary: '*** RIASSUNTO ***',
  },

  actions: {
    fold: ['folda'],
    check: ['fa check'],
    call: ['chiama {amount}'],
    bet: ['punta {amount}'],
    raise: ['rilancia {by} fino a {to}'],
    postSb: ['versa il piccolo buio {amount}'],
    postBb: ['versa il grande buio {amount}'],
    postAnte: ["versa l'ante {amount}"], // UNVERIFIED
    postDead: ['versa il piccolo e il grande buio {amount}'], // UNVERIFIED
    straddle: [],
    show: ['mostra [{cards}] ({desc})', 'mostra [{cards}]'],
    muck: ['scarta il punto'], // UNVERIFIED
    noShow: ['non mostra il punto'],
  },

  allInSuffixes: ['ed è all-in'],
  sittingOutSuffixes: ['è in sit-out'],

  summary: {
    totalPot: 'Piatto totale {pot}',
    mainPot: 'Piatto principale {mainPot}', // UNVERIFIED
    sidePot: 'Piatto laterale {sidePot}', // UNVERIFIED
    sidePotIndexed: 'Piatto laterale-{potIndex} {sidePot}', // UNVERIFIED
    rake: 'Rake {rake}',
    board: 'Board [{cards}]',
    seat: 'Posto {seat}: {rest}',
    shown: 'ha mostrato [{cards}]',
    mucked: 'ha scartato [{cards}]', // UNVERIFIED
    won: 'e ha vinto', // UNVERIFIED
    lost: 'e ha perso',
    collected: 'ha raccolto',
    // The summary writes the blinds in English while the button stays Italian,
    // and the action lines use Italian for both. Both forms are handled.
    positions: { button: 'bottone', sb: 'small blind', bb: 'big blind' },
  },

  noise: [
    'è in sit-out',
    'va in sit-out',
    'si alza dal tavolo',
    'si siede al tavolo',
    'ha esaurito il tempo', // UNVERIFIED
    'è connesso', // UNVERIFIED
    'è disconnesso', // UNVERIFIED
    'ha detto,', // UNVERIFIED
  ],

  games: {
    variants: [
      { match: "Hold'em", code: 'holdem' },
      { match: 'Omaha Hi/Lo', code: 'omaha-hi-lo' },
      { match: 'Omaha', code: 'omaha' },
    ],
    limits: [
      { match: 'Pot Limit', limit: 'pl' },
      { match: 'No Limit', limit: 'nl' },
      { match: 'Limit', limit: 'fl' },
    ],
  },
}
