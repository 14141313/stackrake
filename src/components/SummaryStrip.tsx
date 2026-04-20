import type { SessionResult } from '../lib/types'

interface Props {
  result: SessionResult
}

function Card({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string
  value: string
  sub?: string
  valueColor?: string
}) {
  return (
    <div className="bg-white rounded-xl p-4 flex flex-col gap-1 min-w-0 border border-gray-100 shadow-sm">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`text-xl ${valueColor ?? 'text-gray-900'}`}>{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  )
}

function sign(n: number): string {
  return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`
}

function fmtDuration(minutes: number): string {
  if (minutes < 1) return '<1 min'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function SummaryStrip({ result }: Props) {
  const {
    netResult,
    grossResult,
    totalHeroRake,
    handsPlayed,
    vpipHands,
    bbPer100,
    dollarsPerHour,
    durationMinutes,
    dateRange,
    stakes,
    tableIds,
  } = result

  const netColor = netResult > 0 ? 'text-positive' : netResult < 0 ? 'text-negative' : 'text-gray-900'
  const bbColor = bbPer100 > 0 ? 'text-positive' : bbPer100 < 0 ? 'text-negative' : 'text-gray-900'
  const hrColor = dollarsPerHour > 0 ? 'text-positive' : dollarsPerHour < 0 ? 'text-negative' : 'text-gray-900'

  const stakeLabel = stakes
    .map(s => `$${s.sb}/$${s.bb}`)
    .join(', ')

  const vpipPct = handsPlayed > 0 ? Math.round((vpipHands / handsPlayed) * 100) : 0

  return (
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
        sub={
          result.totalHeroDeductions > result.totalHeroRake
            ? `total deductions $${result.totalHeroDeductions.toFixed(2)} · VPIP ${vpipPct}%`
            : `VPIP ${vpipPct}% · ${vpipHands}/${handsPlayed} hands`
        }
        valueColor="text-brand"
      />
      <Card
        label="Hands"
        value={handsPlayed.toLocaleString()}
        sub={`${tableIds.length} table${tableIds.length !== 1 ? 's' : ''}`}
        valueColor="text-brand"
      />
      <Card
        label="Session"
        value={fmtDuration(durationMinutes)}
        sub={`${fmtDate(dateRange.from)} · ${fmtTime(dateRange.from)} – ${fmtTime(dateRange.to)}`}
        valueColor="text-brand"
      />
    </div>
  )
}
