import { useState } from 'react'
import type { SessionResult, GemSnapshot } from '../lib/types'
import { monthKey, prevMonthKey } from '../lib/storage'

interface Props {
  result: SessionResult
  snapshots: GemSnapshot[]
}

// Ocean Rewards tiers and their rakeback percentages
const TIERS = [
  { name: 'Fish',   pct: 0.10 },
  { name: 'Bronze', pct: 0.15 },
  { name: 'Silver', pct: 0.20 },
  { name: 'Gold',   pct: 0.25 },
  { name: 'Shark',  pct: 0.30 },
] as const

type TierName = typeof TIERS[number]['name']

const GEMS_PER_DOLLAR = 1000

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function RakebackPanel({ result, snapshots }: Props) {
  const [tier, setTier] = useState<TierName>('Bronze')

  const tierPct = TIERS.find(t => t.name === tier)?.pct ?? 0.15
  const rakeEstimate = result.totalHeroRake
  const rakeback = rakeEstimate * tierPct

  // ── GEM history from snapshots ──────────────────────────────────────────────
  // Sort snapshots oldest-first for calculation
  const sorted = [...snapshots].sort((a, b) => a.month.localeCompare(b.month))

  // Build month-by-month GEM earnings from consecutive snapshots
  interface MonthGems {
    month: string
    earned: number   // GEMs accumulated this month
    redeemed: number // GEMs cashed out this month
    cashValue: number
  }
  const monthlyGems: MonthGems[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    const earned = curr.balance - prev.balance + curr.redeemed
    monthlyGems.push({
      month: curr.month,
      earned: Math.max(0, earned),
      redeemed: curr.redeemed,
      cashValue: curr.redeemed / GEMS_PER_DOLLAR,
    })
  }

  // Most recent snapshot for current balance display
  const latestSnapshot = sorted[sorted.length - 1] ?? null
  const currentMonth = monthKey()
  const prevMonth = prevMonthKey()

  // Last month's data if available
  const lastMonthData = monthlyGems.find(m => m.month === currentMonth)
    ?? monthlyGems.find(m => m.month === prevMonth)
    ?? null

  // Total GEM cashback across all tracked months
  const totalGemCash = monthlyGems.reduce((s, m) => s + m.cashValue, 0)

  // True net for this session = net + rakeback + last month gem cash (as proxy)
  const sessionGemValue = lastMonthData ? lastMonthData.cashValue : 0
  const trueNet = result.netResult + rakeback + sessionGemValue
  const trueNetColor = trueNet > 0 ? 'text-pos' : trueNet < 0 ? 'text-neg' : 'text-white'

  function sign(n: number): string {
    if (n === 0) return '$0.00'
    return n > 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`
  }

  const hasSnapshots = snapshots.length > 0
  const hasMonthlyData = monthlyGems.length > 0

  return (
    <div className="bg-[#1a1a1a] rounded-lg p-6 mb-6">
      <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-4">Rakeback Estimate</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

        {/* Tier selector */}
        <div>
          <label className="block text-xs text-gray-500 mb-2">Ocean Rewards Tier</label>
          <div className="flex flex-wrap gap-2">
            {TIERS.map(t => (
              <button
                key={t.name}
                onClick={() => setTier(t.name)}
                className={`px-3 py-1 rounded text-xs font-mono border transition-colors ${
                  tier === t.name
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-gray-700 text-gray-500 hover:border-gray-500'
                }`}
              >
                {t.name} {Math.round(t.pct * 100)}%
              </button>
            ))}
          </div>

          {/* Current GEM balance from latest snapshot */}
          {latestSnapshot && (
            <div className="mt-4 p-3 rounded bg-[#0f0f0f] border border-gray-800">
              <p className="text-xs text-gray-600 mb-1">GEM Balance ({monthLabel(latestSnapshot.month)})</p>
              <p className="text-sm font-mono text-white">{latestSnapshot.balance.toLocaleString()} GEMs</p>
              <p className="text-xs text-gray-600 mt-0.5">${(latestSnapshot.balance / GEMS_PER_DOLLAR).toFixed(2)} unredeemed value</p>
            </div>
          )}
        </div>

        {/* GEM history */}
        <div>
          <label className="block text-xs text-gray-500 mb-2">
            GEM History
            {!hasSnapshots && <span className="text-gray-700 ml-2">— complete monthly check-ins to track</span>}
          </label>

          {hasMonthlyData ? (
            <div className="space-y-2">
              {monthlyGems.slice(-3).reverse().map(m => (
                <div key={m.month} className="flex justify-between items-center text-xs font-mono py-1.5 border-b border-gray-800 last:border-0">
                  <span className="text-gray-500">{monthLabel(m.month)}</span>
                  <div className="text-right">
                    <span className="text-gray-300">+{m.earned.toLocaleString()} GEMs</span>
                    {m.redeemed > 0 && (
                      <span className="text-accent ml-2">{sign(m.cashValue)}</span>
                    )}
                  </div>
                </div>
              ))}
              {totalGemCash > 0 && (
                <div className="flex justify-between items-center text-xs font-mono pt-1">
                  <span className="text-gray-600">Total cashed out</span>
                  <span className="text-accent font-semibold">{sign(totalGemCash)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-700 py-2">
              {hasSnapshots
                ? 'Need at least 2 monthly check-ins to calculate GEM earnings.'
                : 'No check-ins recorded yet. You\'ll be prompted on the 1st of each month.'}
            </div>
          )}
        </div>

        {/* Session estimates */}
        <div className="space-y-3">
          <Row label="Rake Paid (estimated)" value={`$${rakeEstimate.toFixed(2)}`} note="proportional, VPIP hands only" />
          <Row label={`Rakeback (${Math.round(tierPct * 100)}% tier)`} value={sign(rakeback)} valueColor="text-accent" />
          {lastMonthData && lastMonthData.cashValue > 0 && (
            <Row
              label={`GEM Cashback (${monthLabel(lastMonthData.month)})`}
              value={sign(lastMonthData.cashValue)}
              valueColor="text-accent"
              note={`${lastMonthData.redeemed.toLocaleString()} GEMs redeemed`}
            />
          )}
          <div className="border-t border-gray-800 pt-3">
            <Row label="True Net (incl. rakeback)" value={sign(trueNet)} valueColor={trueNetColor} bold />
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-600 italic">
        Rakeback figures are estimates. GEM bulk redemption may offer better value than the standard rate — check Ocean Rewards for current offers.
      </p>
    </div>
  )
}

function Row({
  label,
  value,
  valueColor,
  note,
  bold,
}: {
  label: string
  value: string
  valueColor?: string
  note?: string
  bold?: boolean
}) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <div className="text-right">
        <span className={`font-mono text-sm ${bold ? 'font-semibold' : ''} ${valueColor ?? 'text-white'}`}>
          {value}
        </span>
        {note && <div className="text-xs text-gray-700">{note}</div>}
      </div>
    </div>
  )
}
