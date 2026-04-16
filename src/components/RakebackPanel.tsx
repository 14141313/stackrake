import { useState } from 'react'
import type { SessionResult } from '../lib/types'

interface Props {
  result: SessionResult
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

// GEM redemption rate: 1,000 GEMs = $1 (standard Ocean Rewards rate)
// Bulk redemption may offer better value — noted as advisory
const GEMS_PER_DOLLAR = 1000

export function RakebackPanel({ result }: Props) {
  const [tier, setTier] = useState<TierName>('Bronze')
  const [gemBalance, setGemBalance] = useState('')
  const [gemRedeemed, setGemRedeemed] = useState('')

  const tierPct = TIERS.find(t => t.name === tier)?.pct ?? 0.15
  const rakeEstimate = result.totalHeroRake

  // Estimated rakeback from tier %
  const rakeback = rakeEstimate * tierPct

  // GEM cashback estimate
  const gems = parseFloat(gemBalance) || 0
  const redeemed = parseFloat(gemRedeemed) || 0
  const netGems = gems - redeemed
  const gemValue = netGems / GEMS_PER_DOLLAR

  // True net = stated net + rakeback value + gem cashback
  const trueNet = result.netResult + rakeback + gemValue
  const trueNetColor = trueNet > 0 ? 'text-pos' : trueNet < 0 ? 'text-neg' : 'text-white'

  function sign(n: number): string {
    if (n === 0) return '$0.00'
    return n > 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`
  }

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
        </div>

        {/* GEM inputs */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">GEM Balance (end of session)</label>
            <input
              type="number"
              placeholder="e.g. 4500"
              value={gemBalance}
              onChange={e => setGemBalance(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-accent/60 placeholder-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">GEMs Redeemed This Session</label>
            <input
              type="number"
              placeholder="e.g. 0"
              value={gemRedeemed}
              onChange={e => setGemRedeemed(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-accent/60 placeholder-gray-700"
            />
          </div>
        </div>

        {/* Estimates */}
        <div className="space-y-3">
          <Row label="Rake Paid (estimated)" value={`$${rakeEstimate.toFixed(2)}`} note="proportional, VPIP hands only" />
          <Row label={`Rakeback (${Math.round(tierPct * 100)}% tier)`} value={sign(rakeback)} valueColor="text-accent" />
          {netGems > 0 && (
            <Row label={`GEM Cashback (${netGems.toLocaleString()} GEMs)`} value={sign(gemValue)} valueColor="text-accent" note="at 1,000 GEMs = $1" />
          )}
          <div className="border-t border-gray-800 pt-3">
            <Row label="True Net (incl. rakeback)" value={sign(trueNet)} valueColor={trueNetColor} bold />
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-600 italic">
        Note: GGPoker advertises 100 TP per $1 rake but actual earned TP may differ. Rakeback figures are estimates.
        GEM bulk redemption may offer better value than the standard rate — check Ocean Rewards for current offers.
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
