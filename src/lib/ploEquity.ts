/**
 * PLO equity calculator — pure JS, no dependencies.
 *
 * Card encoding: rank * 4 + suit
 *   rank: 2=0, 3=1, 4=2, 5=3, 6=4, 7=5, 8=6, 9=7, T=8, J=9, Q=10, K=11, A=12
 *   suit: c=0, d=1, h=2, s=3
 *
 * PLO rules: must use exactly 2 hole cards + exactly 3 board cards.
 */

// ── Card encoding ─────────────────────────────────────────────────────────────

const RANK_MAP: Record<string, number> = {
  '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5,
  '8': 6, '9': 7, 'T': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12,
}
const SUIT_MAP: Record<string, number> = { c: 0, d: 1, h: 2, s: 3 }

export function cardToInt(card: string): number {
  const rank = RANK_MAP[card[0]]
  const suit = SUIT_MAP[card[1]]
  if (rank === undefined || suit === undefined) throw new Error(`Invalid card: "${card}"`)
  return rank * 4 + suit
}

export function parseCards(cards: string[]): number[] {
  return cards.map(cardToInt)
}

// ── 5-card hand evaluator ─────────────────────────────────────────────────────
// Returns a score where higher = better hand.
// Category multipliers: SF=8M, Quads=7M, FH=6M, Flush=5M, Straight=4M, Trips=3M, 2P=2M, 1P=1M, HC=0

function eval5(cards: number[]): number {
  const r0 = cards[0] >> 2, r1 = cards[1] >> 2, r2 = cards[2] >> 2,
        r3 = cards[3] >> 2, r4 = cards[4] >> 2
  const s0 = cards[0] & 3, s1 = cards[1] & 3, s2 = cards[2] & 3,
        s3 = cards[3] & 3, s4 = cards[4] & 3

  const flush = s0 === s1 && s1 === s2 && s2 === s3 && s3 === s4

  // Sort ranks descending
  const sr = [r0, r1, r2, r3, r4].sort((a, b) => b - a)

  // Straight detection
  let straight = false
  let straightHigh = 0
  const unique5 = new Set(sr).size === 5
  if (unique5) {
    if (sr[0] - sr[4] === 4) {
      straight = true
      straightHigh = sr[0]
    } else if (sr[0] === 12 && sr[1] === 3 && sr[2] === 2 && sr[3] === 1 && sr[4] === 0) {
      // A-2-3-4-5 wheel — 5-high straight
      straight = true
      straightHigh = 3
    }
  }

  // Frequency groups
  const freq = new Map<number, number>()
  freq.set(r0, (freq.get(r0) ?? 0) + 1)
  freq.set(r1, (freq.get(r1) ?? 0) + 1)
  freq.set(r2, (freq.get(r2) ?? 0) + 1)
  freq.set(r3, (freq.get(r3) ?? 0) + 1)
  freq.set(r4, (freq.get(r4) ?? 0) + 1)

  // Sort by count desc, then rank desc
  const g = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const [g0, g1, g2, g3] = g

  if (flush && straight) return 8_000_000 + straightHigh

  if (g0[1] === 4) return 7_000_000 + g0[0] * 13 + g1[0]

  if (g0[1] === 3 && g1[1] === 2) return 6_000_000 + g0[0] * 13 + g1[0]

  if (flush) {
    return 5_000_000 + sr[0] * 28561 + sr[1] * 2197 + sr[2] * 169 + sr[3] * 13 + sr[4]
  }

  if (straight) return 4_000_000 + straightHigh

  if (g0[1] === 3) {
    const k = [g1[0], g2[0]].sort((a, b) => b - a)
    return 3_000_000 + g0[0] * 169 + k[0] * 13 + k[1]
  }

  if (g0[1] === 2 && g1[1] === 2) {
    const p = [g0[0], g1[0]].sort((a, b) => b - a)
    return 2_000_000 + p[0] * 169 + p[1] * 13 + g2[0]
  }

  if (g0[1] === 2) {
    const k = [g1[0], g2[0], g3[0]].sort((a, b) => b - a)
    return 1_000_000 + g0[0] * 2197 + k[0] * 169 + k[1] * 13 + k[2]
  }

  // High card
  return sr[0] * 28561 + sr[1] * 2197 + sr[2] * 169 + sr[3] * 13 + sr[4]
}

// ── Best PLO hand ─────────────────────────────────────────────────────────────
// Enumerate C(4,2) × C(board,3), return highest 5-card score.

function bestPloHand(hole: number[], board: number[]): number {
  let best = -1
  const h = hole, b = board, bLen = board.length
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 4; j++) {
      for (let a = 0; a < bLen - 2; a++) {
        for (let c = a + 1; c < bLen - 1; c++) {
          for (let d = c + 1; d < bLen; d++) {
            const score = eval5([h[i], h[j], b[a], b[c], b[d]])
            if (score > best) best = score
          }
        }
      }
    }
  }
  return best
}

// ── Equity calculator ─────────────────────────────────────────────────────────
/**
 * Returns hero's equity (0–1) against one villain in a PLO hand.
 *
 * - board.length === 4 (turn): exact enumeration over 1 river card
 * - board.length === 3 (flop): exact enumeration over C(deck,2) run-outs
 * - board.length === 0 (preflop) or 5 (complete): Monte Carlo / single eval
 */
export function ploEquity(
  heroCards: number[],
  villainCards: number[],
  board: number[],
  mcIterations = 2_000,
): number {
  // Build remaining deck
  const used = new Set([...heroCards, ...villainCards, ...board])
  const deck: number[] = []
  for (let i = 0; i < 52; i++) {
    if (!used.has(i)) deck.push(i)
  }

  const needed = 5 - board.length

  // Board already complete
  if (needed <= 0) {
    const h = bestPloHand(heroCards, board)
    const v = bestPloHand(villainCards, board)
    return h > v ? 1 : h === v ? 0.5 : 0
  }

  // 1 card to come — exact
  if (needed === 1) {
    let wins = 0, ties = 0
    for (const card of deck) {
      const fb = [...board, card]
      const h = bestPloHand(heroCards, fb)
      const v = bestPloHand(villainCards, fb)
      if (h > v) wins++
      else if (h === v) ties++
    }
    return (wins + ties * 0.5) / deck.length
  }

  // 2 cards to come — exact C(deck,2) enumeration
  if (needed === 2) {
    let wins = 0, ties = 0, total = 0
    const n = deck.length
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const fb = [...board, deck[i], deck[j]]
        const h = bestPloHand(heroCards, fb)
        const v = bestPloHand(villainCards, fb)
        if (h > v) wins++
        else if (h === v) ties++
        total++
      }
    }
    return (wins + ties * 0.5) / total
  }

  // Preflop (5 cards to come) or 1-card board — Monte Carlo
  let wins = 0, ties = 0
  const d = [...deck]
  for (let iter = 0; iter < mcIterations; iter++) {
    // Partial Fisher-Yates: shuffle only the first `needed` positions
    for (let i = 0; i < needed; i++) {
      const j = i + Math.floor(Math.random() * (d.length - i))
      const tmp = d[i]; d[i] = d[j]; d[j] = tmp
    }
    const fb = [...board, ...d.slice(0, needed)]
    const h = bestPloHand(heroCards, fb)
    const v = bestPloHand(villainCards, fb)
    if (h > v) wins++
    else if (h === v) ties++
  }
  return (wins + ties * 0.5) / mcIterations
}
