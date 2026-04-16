import type { SessionHand, Position, Stakes } from './types'

// ── Regex patterns ────────────────────────────────────────────────────────────

const HAND_ID_RE = /^Poker Hand #(\S+):/
const DATE_RE = /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/
const STAKES_RE = /PLO \(\$?([\d.]+)\/\$?([\d.]+)\)/
const TABLE_RE = /^Table '([^']+)'/
const SEAT_RE = /^Seat (\d+): (.+?) \((?:you\) )?\(?\$?([\d,.]+) in chips\)?/
const SEAT_YOU_RE = /^Seat (\d+): (.+?) \(you\)/
const BUTTON_RE = /^Table .+ Seat #(\d+) is the button/

const FLOP_RE = /^\*\*\* FLOP \*\*\* \[(\S+) (\S+) (\S+)\]/
const TURN_RE = /^\*\*\* TURN \*\*\* \[.+\] \[(\S+)\]/
const RIVER_RE = /^\*\*\* RIVER \*\*\* \[.+\] \[(\S+)\]/
const TOTAL_POT_RE = /Total pot \$?([\d.]+) \| Rake \$?([\d.]+)/
const HOLE_CARDS_RE = /Dealt to Hero \[(.+?)\]/
// Summary seat line for Hero — handles "won", "collected", possibly multiple
const HERO_WON_RE = /^Seat \d+: Hero .*?(?:won|collected) \(\$?([\d.]+)\)/
// "PlayerName: shows [cards]" — villain hole cards shown at showdown
const SHOWS_RE = /^(.+?): shows \[(.+?)\]/
const RAISES_TO_RE = /raises \$?[\d.]+ to \$?([\d.]+)/
const BETS_RE = /bets \$?([\d.]+)/
const CALLS_RE = /calls \$?([\d.]+)/
const POSTS_RE = /posts (?:small blind|big blind|missed blind|straddle) \$?([\d.]+)/
const ALL_IN_RE = /and is all-in/

// ── Position derivation (identical to poker-trainer) ─────────────────────────

function derivePosition(heroSeat: number, buttonSeat: number, seats: number[]): Position {
  const n = seats.length
  const btnIdx = seats.indexOf(buttonSeat)
  const heroIdx = seats.indexOf(heroSeat)
  if (btnIdx === -1 || heroIdx === -1) return 'BB'

  const offset = (heroIdx - btnIdx + n) % n

  if (n === 2) return offset === 0 ? 'BTN' : 'BB'

  switch (offset) {
    case 0: return 'BTN'
    case 1: return 'SB'
    case 2: return 'BB'
    default: {
      const remaining = n - 3
      const posFromBB = offset - 3
      if (remaining <= 1) return 'CO'
      if (remaining === 2) return posFromBB === 0 ? 'UTG' : 'CO'
      if (posFromBB === 0) return 'UTG'
      if (posFromBB === remaining - 1) return 'CO'
      return 'MP'
    }
  }
}

// ── Street tracker ────────────────────────────────────────────────────────────

type Street = 'preflop' | 'flop' | 'turn' | 'river'

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseSessionHand(hand: string): SessionHand | null {
  const lines = hand.split('\n')

  // Hand ID
  const idMatch = lines[0]?.match(HAND_ID_RE)
  if (!idMatch) return null
  const handId = idMatch[1]

  // Timestamp
  const dateMatch = hand.match(DATE_RE)
  const timestamp = dateMatch ? new Date(dateMatch[1].replace(/\//g, '-')) : new Date(0)

  // Stakes
  const stakesMatch = hand.match(STAKES_RE)
  const stakes: Stakes = stakesMatch
    ? { sb: parseFloat(stakesMatch[1]), bb: parseFloat(stakesMatch[2]) }
    : { sb: 0, bb: 0 }

  // Table
  const tableMatch = lines[1]?.match(TABLE_RE)
  const tableId = tableMatch ? tableMatch[1] : 'unknown'

  // Button seat
  let buttonSeat = -1
  for (const line of lines) {
    const m = line.match(BUTTON_RE)
    if (m) { buttonSeat = parseInt(m[1], 10); break }
  }
  if (buttonSeat === -1) return null

  // Seats + hero detection
  const seats: number[] = []
  let heroSeat = -1
  const playerNames = new Map<number, string>()

  for (const line of lines) {
    const youMatch = line.match(SEAT_YOU_RE)
    if (youMatch) {
      const seatNum = parseInt(youMatch[1], 10)
      seats.push(seatNum)
      playerNames.set(seatNum, youMatch[2].trim())
      heroSeat = seatNum
      continue
    }
    const seatMatch = line.match(SEAT_RE)
    if (seatMatch) {
      const seatNum = parseInt(seatMatch[1], 10)
      const name = seatMatch[2].trim()
      seats.push(seatNum)
      playerNames.set(seatNum, name)
      if (name === 'Hero') heroSeat = seatNum
    }
  }

  if (heroSeat === -1) return null

  seats.sort((a, b) => a - b)
  const heroPosition = derivePosition(heroSeat, buttonSeat, seats)

  // Hero starting stack
  const heroStartStack = parseFloat(
    (hand.match(new RegExp(`Seat ${heroSeat}: Hero \\(\\$?([\\d.]+) in chips\\)`)) ||
     hand.match(new RegExp(`Seat ${heroSeat}: Hero \\(you\\).*\\(\\$?([\\d.]+) in chips\\)`)) ||
     ['', '', '0'])[1] || '0'
  )

  // Hole cards
  const holeCardsMatch = hand.match(HOLE_CARDS_RE)
  const holeCards = holeCardsMatch ? holeCardsMatch[1].split(' ') : []

  // ── Parse action to compute contribution + VPIP + all-in ─────────────────

  let currentStreet: Street = 'preflop'
  const heroCommitted: Record<Street, number> = { preflop: 0, flop: 0, turn: 0, river: 0 }
  let heroVPIP = false
  let isAllIn = false
  const board: string[] = []
  const boardAtAllIn: string[] = []
  const villainCards: string[][] = []
  let inSummary = false
  for (const line of lines) {
    // Section markers
    if (line.startsWith('*** SUMMARY ***')) { inSummary = true; continue }
    if (line.startsWith('*** HOLE CARDS ***')) continue
    if (line.startsWith('*** FLOP ***')) {
      currentStreet = 'flop'
      const fm = line.match(FLOP_RE)
      if (fm) board.push(fm[1], fm[2], fm[3])
      continue
    }
    if (line.startsWith('*** TURN ***')) {
      currentStreet = 'turn'
      const tm = line.match(TURN_RE)
      if (tm) board.push(tm[1])
      continue
    }
    if (line.startsWith('*** RIVER ***')) {
      currentStreet = 'river'
      const rm = line.match(RIVER_RE)
      if (rm) board.push(rm[1])
      continue
    }
    if (line.startsWith('*** SHOWDOWN ***')) continue
    // Skip "Dealt to" card lines — not action lines
    if (line.startsWith('Dealt to')) continue

    // Villain shows cards at showdown (before summary)
    if (!inSummary) {
      const showsM = line.match(SHOWS_RE)
      if (showsM && showsM[1].trim() !== 'Hero') {
        villainCards.push(showsM[2].trim().split(' '))
      }
    }

    if (inSummary) continue

    // Uncalled bet returned to Hero — subtract from current street contribution
    if (line.startsWith('Uncalled bet')) {
      const ucM = line.match(/Uncalled bet \(\$?([\d.]+)\) returned to Hero/)
      if (ucM) heroCommitted[currentStreet] -= parseFloat(ucM[1])
      continue
    }

    // Must be an action line
    const colonIdx = line.indexOf(': ')
    if (colonIdx === -1) continue
    const player = line.slice(0, colonIdx).trim()
    const rest = line.slice(colonIdx + 2)

    if (player !== 'Hero') continue

    // Hero action
    const allInThisAction = ALL_IN_RE.test(rest)

    if (rest.startsWith('raises')) {
      const m = rest.match(RAISES_TO_RE)
      if (m) heroCommitted[currentStreet] = parseFloat(m[1])
      if (currentStreet === 'preflop') heroVPIP = true
    } else if (rest.startsWith('bets')) {
      const m = rest.match(BETS_RE)
      if (m) heroCommitted[currentStreet] += parseFloat(m[1])
    } else if (rest.startsWith('calls')) {
      const m = rest.match(CALLS_RE)
      if (m) heroCommitted[currentStreet] += parseFloat(m[1])
      if (currentStreet === 'preflop') heroVPIP = true
    } else if (rest.startsWith('posts')) {
      // Blind post — not voluntary
      const m = rest.match(POSTS_RE)
      if (m) heroCommitted[currentStreet] += parseFloat(m[1])
      // straddle counts as voluntary VPIP
      if (rest.includes('straddle')) heroVPIP = true
    }

    if (allInThisAction) {
      isAllIn = true
      boardAtAllIn.push(...board)
    }
  }

  const heroContributed = heroCommitted.preflop + heroCommitted.flop + heroCommitted.turn + heroCommitted.river

  // ── Parse rake + Hero's collected amount from SUMMARY ─────────────────────

  let totalPot = 0
  let rake = 0
  let heroCollected = 0

  for (const line of lines) {
    const potMatch = line.match(TOTAL_POT_RE)
    if (potMatch) {
      totalPot = parseFloat(potMatch[1])
      rake = parseFloat(potMatch[2])
    }
    const wonMatch = line.match(HERO_WON_RE)
    if (wonMatch) heroCollected += parseFloat(wonMatch[1])
  }

  const heroNet = heroCollected - heroContributed

  // Proportional rake only on VPIP hands
  const heroRake = heroVPIP && totalPot > 0
    ? rake * (heroContributed / totalPot)
    : 0

  return {
    handId,
    tableId,
    timestamp,
    stakes,
    heroStartStack,
    heroNet,
    heroContributed,
    heroCollected,
    rake,
    heroRake,
    heroVPIP,
    position: heroPosition,
    numPlayers: seats.length,
    isAllIn,
    holeCards,
    boardAtAllIn,
    villainCards,
    totalPot,
  }
}
