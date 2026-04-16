export type Position = 'BTN' | 'SB' | 'BB' | 'UTG' | 'MP' | 'CO'

export interface Stakes {
  sb: number
  bb: number
}

export interface SessionHand {
  handId: string
  tableId: string
  timestamp: Date
  stakes: Stakes
  heroStartStack: number
  /** net chips this hand: heroCollected - heroContributed */
  heroNet: number
  heroContributed: number
  heroCollected: number
  /** total rake on this hand (from pot summary) */
  rake: number
  /** hero's proportional share of rake (only on VPIP'd hands) */
  heroRake: number
  heroVPIP: boolean
  position: Position
  numPlayers: number
  isAllIn: boolean
  holeCards: string[]
  /** board cards present at time of all-in */
  boardAtAllIn: string[]
  /** hole cards of each villain who showed at showdown */
  villainCards: string[][]
  /** total pot amount (before rake) */
  totalPot: number
}

// ── GEM snapshots ─────────────────────────────────────────────────────────────

/** One monthly GEM balance check-in. */
export interface GemSnapshot {
  id: string
  month: string      // 'YYYY-MM'
  balance: number    // GEM balance at start of this month (= end of last month)
  redeemed: number   // GEMs redeemed during last month
  recordedAt: number // Date.now()
}

// ── Session persistence ───────────────────────────────────────────────────────

/**
 * A SessionHand with timestamp stored as a number (for JSON serialisation).
 * Reconstructed back to SessionHand on load.
 */
export type RawHand = Omit<SessionHand, 'timestamp'> & { timestamp: number }

/**
 * One uploaded session (= one drag-and-drop of files).
 * Multiple stakes may be present (e.g. $0.25/$0.5 and $0.5/$1 in same session).
 */
export interface SessionRecord {
  id: string
  storedAt: number      // Date.now() when uploaded
  fileNames: string[]
  site: string          // 'GGPoker', 'Natural8', etc.
  hands: RawHand[]
}

// ── Position stats ────────────────────────────────────────────────────────────

export interface PositionStats {
  net: number
  hands: number
  vpipHands: number
  rake: number
}

export interface SessionResult {
  hands: SessionHand[]
  tableIds: string[]
  dateRange: { from: Date; to: Date }
  durationMinutes: number
  stakes: Stakes[]
  /** net result in $ (after rake has been paid) */
  netResult: number
  /** net + heroRake — what Hero won before rake deduction */
  grossResult: number
  totalHeroRake: number
  handsPlayed: number
  vpipHands: number
  /** net / bigBlind */
  bbWon: number
  /** (bbWon / handsPlayed) * 100 */
  bbPer100: number
  dollarsPerHour: number
  positionBreakdown: Record<Position, PositionStats>
  /** whether any all-in hand has a computable EV (villain cards known) */
  hasEVData: boolean
  /** cumulative net at each hand (sorted by timestamp) */
  cumulativePnL: Array<{ handIndex: number; cumNet: number; cumEV: number; timestamp: Date; tableId: string }>
}
