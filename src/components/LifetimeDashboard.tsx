import { useMemo, useState } from 'react'
import type { SessionRecord, SessionResult, GemSnapshot } from '../lib/types'
import { rawToHand } from '../lib/storage'
import { analyseSession } from '../lib/analyseSession'
import { SessionGraph } from './SessionGraph'
import { SessionLibrary } from './SessionLibrary'

interface Props {
  records: SessionRecord[]
  snapshots: GemSnapshot[]
  onView: (recordId: string, stakeKey: string | null) => void
  onDelete: (recordId: string) => void
  onUpload: () => void
}

const TIERS = [
  { name: 'Fish',   pct: 0.10 },
  { name: 'Bronze', pct: 0.15 },
  { name: 'Silver', pct: 0.20 },
  { name: 'Gold',   pct: 0.25 },
  { name: 'Shark',  pct: 0.30 },
] as const
type TierName = typeof TIERS[number]['name']

const GEMS_PER_DOLLAR = 1000

function getTier(): TierName {
  return (localStorage.getItem('plo-rakeback-tier') as TierName) ?? 'Bronze'
}

function saveTier(t: TierName) {
  localStorage.setItem('plo-rakeback-tier', t)
}

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
    <div className="bg-[#1a1a1a] rounded p-4 flex flex-col gap-1 min-w-0">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`font-mono text-xl ${valueColor ?? 'text-white'}`}>{value}</span>
      {sub && <span className="text-xs text-gray-500 font-mono">{sub}</span>}
      {children}
    </div>
  )
}

export function LifetimeDashboard({ records, snapshots, onView, onDelete, onUpload }: Props) {
  const [tier, setTierState] = useState<TierName>(getTier)

  function setTier(t: TierName) {
    saveTier(t)
    setTierState(t)
  }

  // Combine all hands across all records into one lifetime result
  const lifetimeResult: SessionResult | null = useMemo(() => {
    if (records.length === 0) return null
    const allHands = records.flatMap(r => r.hands.map(rawToHand))
    return allHands.length > 0 ? analyseSession(allHands) : null
  }, [records])

  // Total GEM cashback from snapshots
  const totalGemCash = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => a.month.localeCompare(b.month))
    let total = 0
    for (let i = 1; i < sorted.length; i++) {
      const earned = sorted[i].redeemed
      total += earned / GEMS_PER_DOLLAR
    }
    return total
  }, [snapshots])

  if (!lifetimeResult) return null

  const {
    netResult, grossResult, totalHeroRake,
    handsPlayed, vpipHands, bbPer100,
    dollarsPerHour, durationMinutes, stakes,
  } = lifetimeResult

  const tierPct = TIERS.find(t => t.name === tier)?.pct ?? 0.15
  const rakeback = totalHeroRake * tierPct
  const primaryBB = stakes.length > 0
    ? stakes.reduce((best, s) => s.bb > best ? s.bb : best, 0)
    : 0.5

  // True BB/100 = (net + rakeback + gem cashback) / primaryBB / hands * 100
  const trueNet = netResult + rakeback + totalGemCash
  const trueBB100 = primaryBB > 0 && handsPlayed > 0
    ? Math.round((trueNet / primaryBB / handsPlayed) * 100 * 10) / 10
    : 0

  const vpipPct = handsPlayed > 0 ? Math.round((vpipHands / handsPlayed) * 100) : 0
  const stakeLabel = stakes.map(s => `$${s.sb}/$${s.bb}`).join(', ')

  const netColor = netResult > 0 ? 'text-pos' : netResult < 0 ? 'text-neg' : 'text-white'
  const bbColor = bbPer100 > 0 ? 'text-pos' : bbPer100 < 0 ? 'text-neg' : 'text-white'
  const hrColor = dollarsPerHour > 0 ? 'text-pos' : dollarsPerHour < 0 ? 'text-neg' : 'text-white'
  const trueColor = trueBB100 > 0 ? 'text-pos' : trueBB100 < 0 ? 'text-neg' : 'text-white'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-mono text-white">Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {handsPlayed.toLocaleString()} hands · {fmtDuration(durationMinutes)} · {records.length} session{records.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={onUpload}
          className="px-4 py-2 rounded border border-accent/50 text-accent text-xs font-mono hover:bg-accent/10 transition-colors"
        >
          + Upload Session
        </button>
      </div>

      {/* Lifetime stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
          value={`${dollarsPerHour >= 0 ? '+' : ''}$${Math.abs(dollarsPerHour).toFixed(2)}`}
          sub={fmtDuration(durationMinutes)}
          valueColor={hrColor}
        />
        <Card
          label="Rake Paid"
          value={`$${totalHeroRake.toFixed(2)}`}
          sub={`VPIP ${vpipPct}% · ${vpipHands}/${handsPlayed}`}
        />
        <Card
          label="Hands"
          value={handsPlayed.toLocaleString()}
          sub={`${records.length} session${records.length !== 1 ? 's' : ''}`}
        />
        {/* True BB/100 tile with inline tier selector */}
        <div className="bg-[#1a1a1a] rounded p-4 flex flex-col gap-1 min-w-0">
          <span className="text-xs text-gray-500 uppercase tracking-wider">True BB/100</span>
          <span className={`font-mono text-xl ${trueColor}`}>
            {trueBB100 >= 0 ? '+' : ''}{trueBB100.toFixed(1)}
          </span>
          <span className="text-xs text-gray-600 font-mono">incl. rakeback + GEMs</span>
          {/* Tier pills */}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {TIERS.map(t => (
              <button
                key={t.name}
                onClick={() => setTier(t.name)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                  tier === t.name
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-gray-800 text-gray-700 hover:border-gray-600 hover:text-gray-500'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lifetime cumulative graph */}
      <SessionGraph result={lifetimeResult} title="Lifetime Graph" />

      {/* Session table */}
      <SessionLibrary
        records={records}
        onView={onView}
        onDelete={onDelete}
        onUpload={onUpload}
        hideDashboard
      />
    </div>
  )
}
