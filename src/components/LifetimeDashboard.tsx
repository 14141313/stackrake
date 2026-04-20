import { useMemo } from 'react'
import type { SessionRecord, SessionResult, GemSnapshot } from '../lib/types'
import { rawToHand } from '../lib/storage'
import { analyseSession } from '../lib/analyseSession'
import { getTierConfig, type TierName } from '../lib/tiers'
import { SessionGraph } from './SessionGraph'
import { SessionLibrary } from './SessionLibrary'
import { Button } from './ui/button'

interface Props {
  records: SessionRecord[]
  snapshots: GemSnapshot[]
  tier: TierName
  onView: (recordId: string, stakeKey: string | null) => void
  onUpload: () => void
}

const GEMS_PER_DOLLAR = 1000

function sign(n: number): string {
  return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function Card({
  label, value, sub, valueColor, children,
}: {
  label: string
  value: string
  sub?: string
  valueColor?: string
  children?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl p-4 flex flex-col gap-1 min-w-0 border border-gray-100 shadow-sm">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`text-xl ${valueColor ?? 'text-gray-900'}`}>{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
      {children}
    </div>
  )
}

export function LifetimeDashboard({ records, snapshots, tier, onView, onUpload }: Props) {
  // Combine all hands across all records into one lifetime result
  const lifetimeResult: SessionResult | null = useMemo(() => {
    if (records.length === 0) return null
    const allHands = records.flatMap(r => r.hands.map(rawToHand))
    return allHands.length > 0 ? analyseSession(allHands) : null
  }, [records])

  // Compute actual play time by summing consecutive inter-hand gaps under 60 min.
  // This correctly handles hands from different days merged into one record —
  // overnight gaps (> 60 min) are treated as session breaks and excluded.
  const totalPlayMinutes = useMemo(() => {
    const allTimestamps = records
      .flatMap(r => r.hands.map(h => h.timestamp))
      .sort((a, b) => a - b)
    if (allTimestamps.length < 2) return 0
    const BREAK_THRESHOLD_MS = 60 * 60_000 // 60 minutes
    let total = 0
    for (let i = 1; i < allTimestamps.length; i++) {
      const gap = allTimestamps[i] - allTimestamps[i - 1]
      if (gap < BREAK_THRESHOLD_MS) total += gap
    }
    return total / 60_000
  }, [records])

  // Total GEM cashback from snapshots
  const totalGemCash = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => a.month.localeCompare(b.month))
    let total = 0
    for (let i = 1; i < sorted.length; i++) {
      total += sorted[i].redeemed / GEMS_PER_DOLLAR
    }
    return total
  }, [snapshots])

  if (!lifetimeResult) return null

  const {
    netResult, grossResult, totalHeroRake,
    handsPlayed, vpipHands, bbPer100,
    dollarsPerHour, durationMinutes, stakes,
    runItTwiceHands, runItThreeHands, primaryBB,
  } = lifetimeResult

  const tierCfg = getTierConfig(tier)
  const rakeback = totalHeroRake * tierCfg.pct

  // True BB/100: add rakeback + GEM cashback converted to BB/100 using the same
  // primaryBB that analyseSession used for bbPer100 — so the delta is directly comparable.
  const trueBB100 = primaryBB > 0 && handsPlayed > 0
    ? Math.round(((netResult + rakeback + totalGemCash) / primaryBB / handsPlayed) * 100 * 10) / 10
    : 0

  // $/hour using summed session durations (not calendar span)
  const lifetimeDollarsPerHour = totalPlayMinutes > 0
    ? Math.round((netResult / (totalPlayMinutes / 60)) * 100) / 100
    : 0

  const vpipPct = handsPlayed > 0 ? Math.round((vpipHands / handsPlayed) * 100) : 0
  const stakeLabel = stakes.map(s => `$${s.sb}/$${s.bb}`).join(', ')

  const netColor = netResult > 0 ? 'text-positive' : netResult < 0 ? 'text-negative' : 'text-gray-900'
  const bbColor = bbPer100 > 0 ? 'text-positive' : bbPer100 < 0 ? 'text-negative' : 'text-gray-900'
  const hrColor = lifetimeDollarsPerHour > 0 ? 'text-positive' : lifetimeDollarsPerHour < 0 ? 'text-negative' : 'text-gray-900'
  const trueColor = trueBB100 > 0 ? 'text-positive' : trueBB100 < 0 ? 'text-negative' : 'text-gray-900'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {handsPlayed.toLocaleString()} hands · {fmtDuration(totalPlayMinutes)} · {records.length} session{records.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onUpload}
          className="text-xs"
        >
          + Upload Session
        </Button>
      </div>

      {/* Lifetime stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
        <Card
          label="Net Result"
          value={sign(netResult)}
          sub={`gross ${sign(grossResult)}`}
          valueColor={netColor}
        />
        <Card
          label="BB / 100"
          value={`${bbPer100 >= 0 ? '+' : ''}${bbPer100.toFixed(1)}`}
          sub={stakeLabel}
          valueColor={bbColor}
        />
        <Card
          label="$ / Hour"
          value={`${lifetimeDollarsPerHour >= 0 ? '+' : '-'}$${Math.abs(lifetimeDollarsPerHour).toFixed(2)}`}
          sub={fmtDuration(totalPlayMinutes)}
          valueColor={hrColor}
        />
        <Card
          label="Rake Paid"
          value={`$${totalHeroRake.toFixed(2)}`}
          sub={`VPIP ${vpipPct}% · ${vpipHands}/${handsPlayed}`}
          valueColor="text-brand"
        />
        <Card
          label="Hands"
          value={handsPlayed.toLocaleString()}
          sub={[
            `${records.length} session${records.length !== 1 ? 's' : ''}`,
            runItTwiceHands > 0 ? `${runItTwiceHands} run-it-twice` : null,
            runItThreeHands > 0 ? `${runItThreeHands} run-it-3x` : null,
          ].filter(Boolean).join(' · ')}
          valueColor="text-brand"
        />

        {/* True BB/100 tile — static tier display, no inline selector */}
        <div className="bg-white rounded-xl p-4 flex flex-col gap-1 min-w-0 border border-gray-100 shadow-sm">
          <span className="text-xs text-gray-500 uppercase tracking-wider">True BB/100</span>
          <span className={`text-xl ${trueColor}`}>
            {trueBB100 >= 0 ? '+' : ''}{trueBB100.toFixed(1)}
          </span>
          <span className="text-xs text-gray-500">incl. rakeback + GEMs</span>
          <span className="text-xs text-brand/70 mt-0.5">
            {tier} · x{tierCfg.multiplier}
          </span>
        </div>

        {/* Rakeback % tile */}
        <div className="bg-white rounded-xl p-4 flex flex-col gap-1 min-w-0 border border-gray-100 shadow-sm">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Rakeback %</span>
          <span className="text-xl text-brand">
            {(tierCfg.pct * 100).toFixed(1)}%
          </span>
          <span className="text-xs text-gray-500">{tier} tier</span>
        </div>
      </div>

      {/* Rakeback disclaimer */}
      <p className="text-xs text-gray-400 mb-6">
        Estimate based on your tier rate applied to raw rake from hand histories. Actual rakeback may vary due to GGPoker PVI adjustment.
      </p>

      {/* Lifetime cumulative graph */}
      <SessionGraph result={lifetimeResult} title="Lifetime Graph" />

      {/* Session table */}
      <SessionLibrary
        records={records}
        onView={onView}

        onUpload={onUpload}
        hideDashboard
      />
    </div>
  )
}
