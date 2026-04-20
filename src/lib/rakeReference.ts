/**
 * GGPoker / Natural8 PLO rake reference
 *
 * Source: GGPoker support pages + Natural8 rake schedule (verified April 2026).
 * All figures are for PLO cash games. Rake rate is a flat 5% of the pot.
 * Caps are per-hand (not per-player). Short-handed (2-4 player) tables use a
 * reduced cap — multiply the full-ring cap by 0.5 for HU/3-max and 0.75 for
 * 4-max (GGNetwork default short-handed multiplier).
 */

export const RAKE_PCT = 0.05

/**
 * Full-ring (5+ player) rake caps by BB size.
 * At PLO5000+ the cap is 1 BB (no fixed $ ceiling — scales with stake).
 */
const FULL_RING_CAPS: Array<{ maxBB: number; capBB: number; capUSD?: number }> = [
  { maxBB: 0.10,  capBB: 3 },                          // PLO10 and below
  { maxBB: 0.25,  capBB: 3,   capUSD: 0.75 },          // PLO25
  { maxBB: 0.50,  capBB: 2,   capUSD: 1.00 },          // PLO50
  { maxBB: 1.00,  capBB: 2,   capUSD: 2.00 },          // PLO100
  { maxBB: 2.00,  capBB: 2,   capUSD: 4.00 },          // PLO200
  { maxBB: 5.00,  capBB: 1.5, capUSD: 7.50 },          // PLO500
  { maxBB: 10.00, capBB: 1.5, capUSD: 15.00 },         // PLO1000
  { maxBB: 20.00, capBB: 1.5, capUSD: 30.00 },         // PLO2000
]
// PLO5000+ → 1 BB (no USD cap hardcoded — pure BB-based)

/**
 * Return the rake cap in dollars for a given stake and player count.
 */
export function getRakeCap(bb: number, numPlayers: number): number {
  // Find the matching tier
  let capUSD: number | undefined
  let capBB: number | undefined

  for (const tier of FULL_RING_CAPS) {
    if (bb <= tier.maxBB) {
      capBB = tier.capBB
      capUSD = tier.capUSD
      break
    }
  }

  // PLO5000+: cap is 1 BB
  if (capBB === undefined) {
    capBB = 1
  }

  // Derive USD cap from BB cap if not explicit
  const fullRingCap = capUSD !== undefined ? Math.min(capBB * bb, capUSD) : capBB * bb

  // Short-handed multiplier
  if (numPlayers <= 2) return round2(fullRingCap * 0.5)
  if (numPlayers <= 4) return round2(fullRingCap * 0.75)
  return round2(fullRingCap)
}

/**
 * Returns true if this hand should have rake taken from it.
 *
 * GGNetwork no-flop-no-drop rule:
 *   – Pure walks (BB wins uncontested, no raise) are NOT raked.
 *   – Any raise preflop (open raise, 3-bet, etc.) triggers rake
 *     even if no flop is seen.
 */
export function shouldHandBeRaked(hadFlop: boolean, preflopRaiseCount: number): boolean {
  return hadFlop || preflopRaiseCount >= 1
}

/**
 * Compute the rake that should have been charged for a hand per the schedule.
 * Returns 0 for hands that pass the no-flop-no-drop check.
 *
 * GGPoker calculates rake on (totalPot − redistributed deductions) and floors
 * to the nearest cent. Redistributed deductions = jackpot + bingo + fortune
 * (these are returned to the player pool and are not part of the rake base).
 */
export function computeExpectedRake(
  totalPot: number,
  bb: number,
  numPlayers: number,
  hadFlop: boolean,
  preflopRaiseCount: number,
  redistributed = 0,
): number {
  if (!shouldHandBeRaked(hadFlop, preflopRaiseCount)) return 0
  const rakeBase = Math.max(0, totalPot - redistributed)
  const cap = getRakeCap(bb, numPlayers)
  return floorCents(Math.min(rakeBase * RAKE_PCT, cap))
}

// ── Display table for UI ──────────────────────────────────────────────────────

export interface RakeTableRow {
  stake: string
  rate: string
  capFullRing: string
  cap4max: string
  capHU: string
  noFlopNoDrop: string
}

export const RAKE_TABLE_DISPLAY: RakeTableRow[] = [
  { stake: 'PLO10 & below', rate: '5%', capFullRing: '3BB',       cap4max: '2.25BB', capHU: '1.5BB', noFlopNoDrop: 'Yes (3-bet exempt)' },
  { stake: 'PLO25',         rate: '5%', capFullRing: '3BB ($0.75)', cap4max: '~$0.56', capHU: '~$0.38', noFlopNoDrop: 'Yes (3-bet exempt)' },
  { stake: 'PLO50',         rate: '5%', capFullRing: '2BB ($1.00)', cap4max: '~$0.75', capHU: '~$0.50', noFlopNoDrop: 'Yes (3-bet exempt)' },
  { stake: 'PLO100',        rate: '5%', capFullRing: '2BB ($2.00)', cap4max: '~$1.50', capHU: '~$1.00', noFlopNoDrop: 'Yes (3-bet exempt)' },
  { stake: 'PLO200',        rate: '5%', capFullRing: '2BB ($4.00)', cap4max: '~$3.00', capHU: '~$2.00', noFlopNoDrop: 'Yes (3-bet exempt)' },
  { stake: 'PLO500',        rate: '5%', capFullRing: '1.5BB ($7.50)', cap4max: '~$5.63', capHU: '~$3.75', noFlopNoDrop: 'Yes (3-bet exempt)' },
  { stake: 'PLO1000',       rate: '5%', capFullRing: '1.5BB ($15)', cap4max: '~$11.25', capHU: '~$7.50', noFlopNoDrop: 'Yes (3-bet exempt)' },
  { stake: 'PLO2000',       rate: '5%', capFullRing: '1.5BB ($30)', cap4max: '~$22.50', capHU: '~$15', noFlopNoDrop: 'Yes (3-bet exempt)' },
  { stake: 'PLO5000+',      rate: '5%', capFullRing: '1BB',         cap4max: '0.75BB', capHU: '0.5BB', noFlopNoDrop: 'Yes (3-bet exempt)' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Floor to nearest cent — GGPoker truncates rather than rounds rake. */
function floorCents(n: number): number {
  return Math.floor(n * 100) / 100
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
