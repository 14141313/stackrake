import type { SessionHand, SessionResult, Position, PositionStats, Stakes } from './types'
import { ploEquity, parseCards } from './ploEquity'

const ALL_POSITIONS: Position[] = ['BTN', 'CO', 'MP', 'UTG', 'BB', 'SB']

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function analyseSession(rawHands: SessionHand[]): SessionResult {
  // Deduplicate by handId
  const seen = new Set<string>()
  const hands: SessionHand[] = []
  for (const h of rawHands) {
    if (!seen.has(h.handId)) {
      seen.add(h.handId)
      hands.push(h)
    }
  }

  if (hands.length === 0) {
    return emptyResult()
  }

  // Sort chronologically
  hands.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  // Date range + duration
  const firstTs = hands[0].timestamp
  const lastTs = hands[hands.length - 1].timestamp
  const durationMinutes = (lastTs.getTime() - firstTs.getTime()) / 60_000

  // Tables + stakes
  const tableSet = new Set<string>()
  const stakesMap = new Map<string, Stakes>()
  for (const h of hands) {
    tableSet.add(h.tableId)
    stakesMap.set(`${h.stakes.sb}/${h.stakes.bb}`, h.stakes)
  }
  const tableIds = [...tableSet]
  const stakes = [...stakesMap.values()]

  // Determine primary big blind (use most common)
  const bbCounts = new Map<number, number>()
  for (const h of hands) {
    bbCounts.set(h.stakes.bb, (bbCounts.get(h.stakes.bb) ?? 0) + 1)
  }
  let primaryBB = 0.5
  let maxCount = 0
  for (const [bb, count] of bbCounts) {
    if (count > maxCount) { maxCount = count; primaryBB = bb }
  }

  // Aggregate totals
  let netResult = 0
  let totalHeroRake = 0
  let vpipHands = 0

  const posAccumulators: Record<Position, PositionStats> = Object.fromEntries(
    ALL_POSITIONS.map(p => [p, { net: 0, hands: 0, vpipHands: 0, rake: 0 }])
  ) as Record<Position, PositionStats>

  const cumulativePnL: SessionResult['cumulativePnL'] = []
  let runningNet = 0
  let runningEV = 0
  let hasEVData = false

  for (let i = 0; i < hands.length; i++) {
    const h = hands[i]
    netResult += h.heroNet
    totalHeroRake += h.heroRake
    if (h.heroVPIP) vpipHands++

    // Compute EV for all-in hands where we have villain cards
    let evNet = h.heroNet  // default: actual result
    if (
      h.isAllIn &&
      h.villainCards.length === 1 &&
      h.holeCards.length === 4 &&
      h.totalPot > 0
    ) {
      try {
        const heroInts = parseCards(h.holeCards)
        const villainInts = parseCards(h.villainCards[0])
        const boardInts = parseCards(h.boardAtAllIn)
        const equity = ploEquity(heroInts, villainInts, boardInts)
        evNet = round2(equity * h.totalPot - h.heroContributed)
        hasEVData = true
      } catch {
        // Invalid card strings — fall back to actual result
      }
    }

    runningNet += h.heroNet
    runningEV += evNet
    cumulativePnL.push({
      handIndex: i + 1,
      cumNet: round2(runningNet),
      cumEV: round2(runningEV),
      timestamp: h.timestamp,
      tableId: h.tableId,
    })

    const pos = posAccumulators[h.position]
    pos.net += h.heroNet
    pos.hands++
    if (h.heroVPIP) pos.vpipHands++
    pos.rake += h.heroRake
  }

  // Round position nets
  for (const pos of ALL_POSITIONS) {
    posAccumulators[pos].net = round2(posAccumulators[pos].net)
    posAccumulators[pos].rake = round2(posAccumulators[pos].rake)
  }

  const grossResult = round2(netResult + totalHeroRake)
  netResult = round2(netResult)
  totalHeroRake = round2(totalHeroRake)

  const handsPlayed = hands.length
  const bbWon = primaryBB > 0 ? round2(netResult / primaryBB) : 0
  const bbPer100 = handsPlayed > 0 ? round2((bbWon / handsPlayed) * 100) : 0
  const dollarsPerHour = durationMinutes > 0
    ? round2(netResult / (durationMinutes / 60))
    : 0

  return {
    hands,
    tableIds,
    dateRange: { from: firstTs, to: lastTs },
    durationMinutes: round2(durationMinutes),
    stakes,
    netResult,
    grossResult,
    totalHeroRake,
    handsPlayed,
    vpipHands,
    bbWon,
    bbPer100,
    dollarsPerHour,
    positionBreakdown: posAccumulators,
    hasEVData,
    cumulativePnL,
  }
}

function emptyResult(): SessionResult {
  const emptyPos = Object.fromEntries(
    ALL_POSITIONS.map(p => [p, { net: 0, hands: 0, vpipHands: 0, rake: 0 }])
  ) as Record<Position, PositionStats>
  return {
    hands: [],
    tableIds: [],
    dateRange: { from: new Date(), to: new Date() },
    durationMinutes: 0,
    stakes: [],
    netResult: 0,
    grossResult: 0,
    totalHeroRake: 0,
    handsPlayed: 0,
    vpipHands: 0,
    bbWon: 0,
    bbPer100: 0,
    dollarsPerHour: 0,
    positionBreakdown: emptyPos,
    hasEVData: false,
    cumulativePnL: [],
  }
}
