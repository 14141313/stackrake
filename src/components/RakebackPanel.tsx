import type { SessionResult, GemSnapshot } from '../lib/types'
import { monthKey, prevMonthKey } from '../lib/storage'
import { getTierConfig, type TierName } from '../lib/tiers'

interface Props {
  result: SessionResult
  snapshots: GemSnapshot[]
  tier: TierName
}

const GEMS_PER_DOLLAR = 1000

function round2(n: number) { return Math.round(n * 100) / 100 }

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function RakebackPanel({ result, snapshots, tier }: Props) {
  const tierCfg = getTierConfig(tier)
  const tierPct = tierCfg.pct
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

        {/* Tier display (read-only — update via account settings) */}
        <div>
          <label className="block text-xs text-gray-500 mb-2">Ocean Rewards Tier</label>
          <div className="p-3 rounded bg-[#0f0f0f] border border-gray-800 text-xs font-mono">
            <span className="text-accent">{tier}</span>
            <span className="text-gray-600 mx-2">·</span>
            <span className="text-gray-400">{Math.round(tierPct * 100)}% rakeback</span>
            <span className="text-gray-600 mx-2">·</span>
            <span className="text-gray-400">x{tierCfg.multiplier} GEMs</span>
          </div>
          <p className="text-xs text-gray-700 mt-1.5">Update in account settings</p>

          {/* Current GEM balance from latest snapshot */}
          {latestSnapshot && (
            <div className="mt-3 p-3 rounded bg-[#0f0f0f] border border-gray-800">
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

      {/* Pot deduction breakdown */}
      {(() => {
        const b = result.deductionBreakdown
        const trueCost = round2(b.rake + b.tax)
        const redistributed = round2(b.jackpot + b.bingo + b.fortune)
        const totalDed = round2(trueCost + redistributed)
        const hasExtra = b.jackpot > 0 || b.bingo > 0 || b.fortune > 0 || b.tax > 0
        const hasAnomalies = result.rakeAnomalyHands.length > 0
        if (!hasExtra && result.unreconciledHands.length === 0 && !hasAnomalies) return null
        return (
          <div className="mt-5 border-t border-gray-800 pt-4 space-y-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Pot Deduction Breakdown</p>

            {/* True cost section */}
            <div>
              <p className="text-xs text-gray-600 mb-2">True cost of playing</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs font-mono">
                <DeductRow label="Rake" value={b.rake} note="TP calculated on this" />
                {b.tax > 0 && <DeductRow label="Tax" value={b.tax} highlight />}
                <div className="col-span-full border-t border-gray-800 pt-2 mt-1 flex justify-between">
                  <span className="text-gray-400 font-semibold">Total permanent cost</span>
                  <span className="text-white font-semibold">${trueCost.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Redistributed section */}
            {redistributed > 0 && (
              <div>
                <p className="text-xs text-gray-600 mb-1">
                  Redistributed to player pool
                  <span className="text-gray-700 ml-1">— EV-neutral over large samples</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs font-mono">
                  {b.jackpot > 0 && <DeductRow label="Jackpot" value={b.jackpot} note="returned to bad-beat winners" />}
                  {b.bingo   > 0 && <DeductRow label="Bingo"   value={b.bingo}   note="returned to bingo prize pool" />}
                  {b.fortune > 0 && <DeductRow label="Fortune" value={b.fortune} note="returned to fortune prize pool" />}
                  <div className="col-span-full border-t border-gray-800 pt-2 mt-1 flex justify-between">
                    <span className="text-gray-400 font-semibold">Total redistributed</span>
                    <span className="text-gray-300 font-semibold">${redistributed.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Grand total */}
            {hasExtra && (
              <div className="flex justify-between items-center text-xs font-mono border-t border-gray-800 pt-2">
                <span className="text-gray-500">Total deducted from pots</span>
                <span className="text-gray-400">${totalDed.toFixed(2)}</span>
              </div>
            )}

            {/* Rake anomaly banner */}
            {hasAnomalies && (
              <div className="flex items-start gap-2 bg-orange-950/30 border border-orange-900/40 rounded px-3 py-2">
                <span className="text-orange-400 text-sm mt-0.5">⚠</span>
                <div>
                  <p className="text-xs text-orange-300 font-mono font-semibold">
                    {result.rakeAnomalyHands.length} rake anomal{result.rakeAnomalyHands.length !== 1 ? 'ies' : 'y'} detected
                  </p>
                  <p className="text-xs text-orange-700 mt-0.5">
                    Reported rake differs from the GGPoker schedule by &gt;$0.02.
                    Max variance: ${Math.max(...result.rakeAnomalyHands.map(h => Math.abs(h.reported - h.expected))).toFixed(2)}
                  </p>
                  <p className="text-xs text-orange-800 mt-1 font-mono">
                    IDs: {result.rakeAnomalyHands.slice(0, 5).map(h => h.handId).join(', ')}
                    {result.rakeAnomalyHands.length > 5 ? ` +${result.rakeAnomalyHands.length - 5} more` : ''}
                  </p>
                </div>
              </div>
            )}

            {/* Reconciliation warning */}
            {result.unreconciledHands.length > 0 && (
              <div className="flex items-start gap-2 bg-yellow-950/30 border border-yellow-900/40 rounded px-3 py-2">
                <span className="text-yellow-500 text-sm mt-0.5">⚠</span>
                <div>
                  <p className="text-xs text-yellow-400 font-mono font-semibold">
                    {result.unreconciledHands.length} unreconciled hand{result.unreconciledHands.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-yellow-700 mt-0.5">
                    Pot total minus deductions minus collected amounts don't balance.
                    Max discrepancy: ${Math.max(...result.unreconciledHands.map(h => Math.abs(h.diff))).toFixed(2)}
                  </p>
                  <p className="text-xs text-yellow-800 mt-1 font-mono">
                    IDs: {result.unreconciledHands.slice(0, 5).map(h => h.handId).join(', ')}
                    {result.unreconciledHands.length > 5 ? ` +${result.unreconciledHands.length - 5} more` : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      <p className="mt-4 text-xs text-gray-600 italic">
        Rakeback estimates are based on your tier rate applied to raw rake from hand histories.
        Actual TP earned may vary due to GGPoker's Player Value Index (PVI) adjustment — the formula is not public.
        GEM bulk redemption may offer better value than the standard rate — check Ocean Rewards for current offers.
      </p>
    </div>
  )
}

function DeductRow({ label, value, note, highlight }: { label: string; value: number; note?: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={highlight ? 'text-orange-600' : 'text-gray-600'}>
        {label}{note ? <span className="text-gray-700 ml-1">({note})</span> : ''}
      </span>
      <span className={highlight ? 'text-orange-400' : 'text-gray-400'}>${value.toFixed(2)}</span>
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
