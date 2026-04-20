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
  /** rake deducted from pot (Ocean Rewards TP calculated against this) */
  rake: number
  /** jackpot contribution deducted from pot */
  jackpot: number
  /** bingo contribution deducted from pot */
  bingo: number
  /** fortune contribution deducted from pot */
  fortune: number
  /** tax deducted from pot */
  tax: number
  /** rake + jackpot + bingo + fortune + tax */
  totalDeductions: number
  /** hero's proportional share of rake only (used for rakeback calculations) */
  heroRake: number
  /** hero's proportional share of all deductions (true cost of playing) */
  heroTotalDeductions: number
  /**
   * Reconciliation check: totalPot - totalDeductions - sumOfAllPlayerCollections.
   * Should be 0. Non-zero values indicate a parsing discrepancy.
   */
  reconciledDiff: number
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
  /** true if a flop was dealt in this hand */
  hadFlop: boolean
  /** number of raises made preflop (across all players) */
  preflopRaiseCount: number
  /** rake expected per the GGPoker schedule (may differ from reported rake) */
  expectedRake: number
  /** reported rake − expected rake (positive = overcharged, negative = undercharged) */
  rakeVariance: number
  /** how many times the board was run (1 = standard, 2 = run-it-twice, 3 = run-it-three-times) */
  runCount: 1 | 2 | 3
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
  /** hero's proportional share of all deductions (rake + jackpot + bingo + fortune + tax) */
  totalHeroDeductions: number
  /** aggregate deduction breakdown across all hands */
  deductionBreakdown: { rake: number; jackpot: number; bingo: number; fortune: number; tax: number }
  /** hands where totalPot - totalDeductions - totalCollected ≠ 0 (> $0.02 diff) */
  unreconciledHands: Array<{ handId: string; diff: number }>
  /** hands where reported rake differs from schedule by > $0.02 */
  rakeAnomalyHands: Array<{ handId: string; reported: number; expected: number }>
  handsPlayed: number
  vpipHands: number
  /** the big blind value used as the BB denominator (most common BB across hands) */
  primaryBB: number
  /** net / bigBlind */
  bbWon: number
  /** (bbWon / handsPlayed) * 100 */
  bbPer100: number
  dollarsPerHour: number
  positionBreakdown: Record<Position, PositionStats>
  /** hands where the board was run twice */
  runItTwiceHands: number
  /** hands where the board was run three times */
  runItThreeHands: number
  /** whether any all-in hand has a computable EV (villain cards known) */
  hasEVData: boolean
  /** cumulative net at each hand (sorted by timestamp) */
  cumulativePnL: Array<{ handIndex: number; cumNet: number; cumEV: number; timestamp: Date; tableId: string }>
}
