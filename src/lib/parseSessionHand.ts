import type { SessionHand, Position, Stakes } from './types'
import { computeExpectedRake } from './rakeReference'

// ── Regex patterns ────────────────────────────────────────────────────────────

const HAND_ID_RE = /^Poker Hand #(\S+):/
const DATE_RE = /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/
const STAKES_RE = /PLO \(\$?([\d.]+)\/\$?([\d.]+)\)/
const TABLE_RE = /^Table '([^']+)'/
const SEAT_RE = /^Seat (\d+): (.+?) \((?:you\) )?\(?\$?([\d,.]+) in chips\)?/
const SEAT_YOU_RE = /^Seat (\d+): (.+?) \(you\)/
const BUTTON_RE = /^Table .+ Seat #(\d+) is the button/

// Match both standard and run-it-multiple-times first-board section headers
const FLOP_RE  = /^\*\*\* (?:FIRST )?FLOP \*\*\* \[(\S+) (\S+) (\S+)\]/
const TURN_RE  = /^\*\*\* (?:FIRST )?TURN \*\*\* \[.+\] \[(\S+)\]/
const RIVER_RE = /^\*\*\* (?:FIRST )?RIVER \*\*\* \[.+\] \[(\S+)\]/
const RUN_TWO_RE   = /Hand was run two times/i
const RUN_THREE_RE = /Hand was run three times/i
const TOTAL_POT_RE = /Total pot \$?([\d.]+).*?\|\s*Rake \$?([\d.]+)(?:\s*\|\s*Jackpot \$?([\d.]+))?(?:\s*\|\s*Bingo \$?([\d.]+))?(?:\s*\|\s*Fortune \$?([\d.]+))?(?:\s*\|\s*Tax \$?([\d.]+))?/
const HOLE_CARDS_RE = /Dealt to Hero \[(.+?)\]/
// Hero's collected amount from summary
const HERO_WON_RE = /^Seat \d+: Hero .*?(?:won|collected) \(\$?([\d.]+)\)/
// Any player's collected amount — used for reconciliation
const ANYONE_WON_RE = /^Seat \d+: .+? (?:won|collected) \(\$?([\d.]+)\)/
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
  const lines = hand.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  // Hand ID
  const idMatch = lines[0]?.match(HAND_ID_RE)
  if (!idMatch) return null
  const handId = idMatch[1]

  // Timestamp
  const dateMatch = hand.match(DATE_RE)
  const timestamp = dateMatch
    ? new Date(dateMatch[1].replace(/\//g, '-').replace(' ', 'T'))
    : new Date(0)

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
  const seatsSet = new Set<number>()
  let heroSeat = -1
  const playerNames = new Map<number, string>()

  for (const line of lines) {
    const youMatch = line.match(SEAT_YOU_RE)
    if (youMatch) {
      const seatNum = parseInt(youMatch[1], 10)
      seatsSet.add(seatNum)
      playerNames.set(seatNum, youMatch[2].trim())
      heroSeat = seatNum
      continue
    }
    const seatMatch = line.match(SEAT_RE)
    if (seatMatch) {
      const seatNum = parseInt(seatMatch[1], 10)
      const name = seatMatch[2].trim()
      seatsSet.add(seatNum)
      playerNames.set(seatNum, name)
      if (name === 'Hero') heroSeat = seatNum
    }
  }
  const seats = [...seatsSet]

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
  let preflopRaiseCount = 0
  const board: string[] = []
  const boardAtAllIn: string[] = []
  const villainCards: string[][] = []
  let inSummary = false
  for (const line of lines) {
    // Section markers
    if (line.startsWith('*** SUMMARY ***')) { inSummary = true; continue }
    if (line.startsWith('*** HOLE CARDS ***')) continue

    // Skip second/third runout section markers — we only build board from first run
    if (line.startsWith('*** SECOND') || line.startsWith('*** THIRD')) continue

    if (line.startsWith('*** FLOP ***') || line.startsWith('*** FIRST FLOP ***')) {
      currentStreet = 'flop'
      const fm = line.match(FLOP_RE)
      if (fm) board.push(fm[1], fm[2], fm[3])
      continue
    }
    if (line.startsWith('*** TURN ***') || line.startsWith('*** FIRST TURN ***')) {
      currentStreet = 'turn'
      const tm = line.match(TURN_RE)
      if (tm) board.push(tm[1])
      continue
    }
    if (line.startsWith('*** RIVER ***') || line.startsWith('*** FIRST RIVER ***')) {
      currentStreet = 'river'
      const rm = line.match(RIVER_RE)
      if (rm) board.push(rm[1])
      continue
    }
    if (line.startsWith('*** SHOWDOWN ***') || line.startsWith('*** FIRST SHOWDOWN ***')) continue
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

    // Count ALL player preflop raises (for no-flop-no-drop rule)
    if (currentStreet === 'preflop' && rest.startsWith('raises')) {
      preflopRaiseCount++
    }

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

  // Detect run-it-multiple-times
  const runCount: 1 | 2 | 3 = RUN_THREE_RE.test(hand) ? 3 : RUN_TWO_RE.test(hand) ? 2 : 1

  // Deduplicate villain cards — run-it-twice shows same cards in each showdown section
  const vcSeen = new Set<string>()
  const uniqueVillainCards = villainCards.filter(vc => {
    const key = [...vc].sort().join(',')
    if (vcSeen.has(key)) return false
    vcSeen.add(key)
    return true
  })

  // ── Parse rake + Hero's collected amount from SUMMARY ─────────────────────

  let totalPot = 0
  let rake = 0
  let jackpot = 0
  let bingo = 0
  let fortune = 0
  let tax = 0
  let heroCollected = 0
  let totalCollected = 0  // sum of ALL player collections (for reconciliation)

  for (const line of lines) {
    const potMatch = line.match(TOTAL_POT_RE)
    if (potMatch) {
      totalPot    = parseFloat(potMatch[1])
      rake        = parseFloat(potMatch[2])
      jackpot     = parseFloat(potMatch[3] ?? '0') || 0
      bingo       = parseFloat(potMatch[4] ?? '0') || 0
      fortune     = parseFloat(potMatch[5] ?? '0') || 0
      tax         = parseFloat(potMatch[6] ?? '0') || 0
    }
    // Use matchAll to capture every won/collected amount per line (handles run-it-twice)
    if (HERO_WON_RE.test(line)) {
      for (const m of line.matchAll(/(?:won|collected) \(\$?([\d.]+)\)/g)) {
        heroCollected += parseFloat(m[1])
      }
    }

    if (ANYONE_WON_RE.test(line)) {
      for (const m of line.matchAll(/(?:won|collected) \(\$?([\d.]+)\)/g)) {
        totalCollected += parseFloat(m[1])
      }
    }
  }

  const totalDeductions = rake + jackpot + bingo + fortune + tax
  const hadFlop = board.length >= 3
  const expectedRake = computeExpectedRake(totalPot, stakes.bb, seats.length, hadFlop, preflopRaiseCount)
  const rakeVariance = Math.round((rake - expectedRake) * 100) / 100

  const heroNet = heroCollected - heroContributed

  // Proportional share — rake only for rakeback, all deductions for true cost
  const heroRake = heroVPIP && totalPot > 0
    ? rake * (heroContributed / totalPot)
    : 0
  const heroTotalDeductions = heroVPIP && totalPot > 0
    ? totalDeductions * (heroContributed / totalPot)
    : 0

  // Reconciliation: totalPot - deductions - totalCollected should be 0
  const reconciledDiff = Math.round(
    (totalPot - totalDeductions - totalCollected) * 100
  ) / 100

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
    jackpot,
    bingo,
    fortune,
    tax,
    totalDeductions,
    heroRake,
    heroTotalDeductions,
    reconciledDiff,
    heroVPIP,
    position: heroPosition,
    numPlayers: seats.length,
    isAllIn,
    holeCards,
    boardAtAllIn,
    villainCards: uniqueVillainCards,
    totalPot,
    hadFlop,
    preflopRaiseCount,
    expectedRake,
    rakeVariance,
    runCount,
  }
}
