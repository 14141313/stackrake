import { useMemo, useState } from 'react'
import type { SessionRecord } from '../lib/types'
import { rawToHand } from '../lib/storage'
import { analyseSession } from '../lib/analyseSession'
import { Select } from './ui/select'

interface Props {
  records: SessionRecord[]
  onView: (recordId: string, stakeKey: string | null) => void
  onUpload: () => void
  /** When true, suppresses the standalone header + empty state (used inside LifetimeDashboard) */
  hideDashboard?: boolean
}

interface BreakdownRow {
  recordId: string
  date: string       // e.g. "16 Apr 2026"
  site: string
  stakeKey: string   // "0.5/1"
  stakeLabel: string // "$0.5/$1"
  hands: number
  net: number
  bb100: number
  dollarsPerHour: number
  rake: number
  vpipPct: number
  durationMinutes: number
}

function stakeLabel(sb: number, bb: number) {
  const fmt = (n: number) => `$${n}`
  return `${fmt(sb)}/${fmt(bb)}`
}

function sign(n: number): string {
  if (n === 0) return '$0.00'
  return n > 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`
}

function fmtBB(n: number): string {
  if (n === 0) return '0.0'
  return n > 0 ? `+${n.toFixed(1)}` : `${n.toFixed(1)}`
}

function sessionDateStr(ts: number): string {
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SessionLibrary({ records, onView, onUpload, hideDashboard = false }: Props) {
  const [filterSite, setFilterSite] = useState<string>('all')
  const [filterStake, setFilterStake] = useState<string>('all')

  // Build breakdown rows: one per (record × stake)
  const { rows, recById, sites, stakes } = useMemo(() => {
    const rows: BreakdownRow[] = []
    const siteSet = new Set<string>()
    const stakeSet = new Set<string>()

    for (const rec of records) {
      const allHands = rec.hands.map(rawToHand)
      siteSet.add(rec.site)

      // Group hands by stake
      const byStake = new Map<string, typeof allHands>()
      for (const h of allHands) {
        const key = `${h.stakes.sb}/${h.stakes.bb}`
        if (!byStake.has(key)) byStake.set(key, [])
        byStake.get(key)!.push(h)
      }

      for (const [key, hands] of byStake) {
        const bb = hands[0].stakes.bb
        const sb = hands[0].stakes.sb
        const label = stakeLabel(sb, bb)
        stakeSet.add(key)

        const result = analyseSession(hands)
        rows.push({
          recordId: rec.id,
          date: sessionDateStr(rec.storedAt),
          site: rec.site,
          stakeKey: key,
          stakeLabel: label,
          hands: result.handsPlayed,
          net: result.netResult,
          bb100: result.bbPer100,
          dollarsPerHour: result.dollarsPerHour,
          rake: result.totalHeroRake,
          vpipPct: result.handsPlayed > 0 ? Math.round(result.vpipHands / result.handsPlayed * 100) : 0,
          durationMinutes: result.durationMinutes,
        })
      }
    }

    // Sort rows: newest session first, then by stake descending
    const recById = new Map(records.map(r => [r.id, r]))
    rows.sort((a, b) => {
      const ra = recById.get(a.recordId)!
      const rb = recById.get(b.recordId)!
      if (rb.storedAt !== ra.storedAt) return rb.storedAt - ra.storedAt
      return b.stakeKey.localeCompare(a.stakeKey)
    })

    return {
      rows,
      recById,
      sites: [...siteSet].sort(),
      stakes: [...stakeSet].sort((a, b) => {
        const [,abb] = a.split('/').map(Number)
        const [,bbb] = b.split('/').map(Number)
        return bbb - abb
      }),
    }
  }, [records])

  const filtered = rows.filter(r =>
    (filterSite === 'all' || r.site === filterSite) &&
    (filterStake === 'all' || r.stakeKey === filterStake)
  )

  // Group filtered rows by record session
  const grouped = useMemo(() => {
    const map = new Map<string, BreakdownRow[]>()
    for (const row of filtered) {
      if (!map.has(row.recordId)) map.set(row.recordId, [])
      map.get(row.recordId)!.push(row)
    }
    // Preserve order from filtered
    const seen = new Set<string>()
    const order: string[] = []
    for (const row of filtered) {
      if (!seen.has(row.recordId)) { seen.add(row.recordId); order.push(row.recordId) }
    }
    return order.map(id => ({ id, rows: map.get(id)! }))
  }, [filtered])

  // Lifetime totals
  const totals = useMemo(() => {
    let hands = 0, net = 0, rake = 0, vpipHands = 0
    for (const r of filtered) { hands += r.hands; net += r.net; rake += r.rake; vpipHands += r.hands * r.vpipPct / 100 }
    return { hands, net: Math.round(net * 100) / 100, rake: Math.round(rake * 100) / 100 }
  }, [filtered])

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[55vh]">
        <h1 className="text-2xl text-gray-900 mb-1">Stackrake</h1>
        <p className="text-gray-500 text-sm mb-10">PLO analytics · GGPoker & Natural8 · Client-side</p>
        <button
          onClick={onUpload}
          className="border-2 border-dashed border-gray-200 hover:border-brand rounded-xl px-16 py-10 text-center transition-colors hover:bg-brand-light/20"
        >
          <div className="text-4xl mb-3 text-gray-400">⬆</div>
          <p className="text-gray-600 mb-1">Drop hand history files here</p>
          <p className="text-gray-400 text-sm">or click to browse · .txt files · multi-file</p>
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header — hidden when rendered inside LifetimeDashboard */}
      {!hideDashboard && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg text-gray-900">Sessions</h1>
            <p className="text-xs text-gray-500 mt-0.5">{records.length} session{records.length !== 1 ? 's' : ''} stored</p>
          </div>
          <button
            onClick={onUpload}
            className="px-4 py-2 rounded-lg border border-brand text-brand text-xs hover:bg-brand-light transition-colors"
          >
            + Upload Session
          </button>
        </div>
      )}

      {/* Sessions heading when inside dashboard */}
      {hideDashboard && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs text-gray-500 uppercase tracking-wider">Sessions</h2>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {sites.length > 1 && (
          <Select
            value={filterSite}
            onChange={e => setFilterSite((e.target as HTMLSelectElement).value)}
            className="text-xs py-1.5 w-auto"
          >
            <option value="all">All Sites</option>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        )}
        {stakes.length > 1 && (
          <Select
            value={filterStake}
            onChange={e => setFilterStake((e.target as HTMLSelectElement).value)}
            className="text-xs py-1.5 w-auto"
          >
            <option value="all">All Stakes</option>
            {stakes.map(k => {
              const [sb, bb] = k.split('/').map(Number)
              return <option key={k} value={k}>{stakeLabel(sb, bb)}</option>
            })}
          </Select>
        )}
        {(filterSite !== 'all' || filterStake !== 'all') && (
          <button
            onClick={() => { setFilterSite('all'); setFilterStake('all') }}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
        {/* Column headers */}
        <div className="grid grid-cols-[140px_90px_110px_60px_100px_80px_80px_64px_80px] text-xs text-gray-400 uppercase tracking-wider px-4 py-3 border-b border-gray-100">
          <span>Date</span>
          <span>Site</span>
          <span>Stake</span>
          <span className="text-right">Hands</span>
          <span className="text-right">Net $</span>
          <span className="text-right">BB/100</span>
          <span className="text-right">$/hr</span>
          <span className="text-right">Rake</span>
          <span></span>
        </div>

        {grouped.map(({ id: recordId, rows: sessionRows }) => {
          const rec = recById.get(recordId)!
          const sessionNet = Math.round(sessionRows.reduce((s, r) => s + r.net, 0) * 100) / 100
          const sessionHands = sessionRows.reduce((s, r) => s + r.hands, 0)
          const sessionRake = Math.round(sessionRows.reduce((s, r) => s + r.rake, 0) * 100) / 100
          const sessionDate = sessionDateStr(rec.storedAt)

          return (
            <div key={recordId} className="border-b border-gray-100 last:border-0">
              {sessionRows.map((row, i) => (
                <div
                  key={row.stakeKey}
                  className="grid grid-cols-[140px_90px_110px_60px_100px_80px_80px_64px_80px] px-4 py-2.5 hover:bg-gray-50 items-center"
                >
                  {/* Date — only on first row of session */}
                  <span className="text-xs text-gray-600">
                    {i === 0 ? sessionDate : ''}
                  </span>
                  <span className="text-xs text-gray-500">{row.site}</span>
                  <span className="text-xs text-gray-700">{row.stakeLabel}</span>
                  <span className="text-xs text-gray-600 text-right">{row.hands}</span>
                  <span className={`text-xs text-right font-semibold ${row.net > 0 ? 'text-positive' : row.net < 0 ? 'text-negative' : 'text-gray-900'}`}>
                    {sign(row.net)}
                  </span>
                  <span className={`text-xs text-right ${row.bb100 > 0 ? 'text-positive' : row.bb100 < 0 ? 'text-negative' : 'text-gray-600'}`}>
                    {fmtBB(row.bb100)}
                  </span>
                  <span className={`text-xs text-right ${row.dollarsPerHour > 0 ? 'text-positive' : row.dollarsPerHour < 0 ? 'text-negative' : 'text-gray-600'}`}>
                    {sign(row.dollarsPerHour)}
                  </span>
                  <span className="text-xs text-gray-500 text-right">${row.rake.toFixed(2)}</span>
                  <div className="flex justify-end">
                    <button
                      onClick={() => onView(recordId, row.stakeKey)}
                      className="text-xs text-gray-400 hover:text-brand transition-colors"
                    >
                      View →
                    </button>
                  </div>
                </div>
              ))}

              {/* Session subtotal (only if >1 stake) */}
              {sessionRows.length > 1 && (
                <div className="grid grid-cols-[140px_90px_110px_60px_100px_80px_80px_64px_80px] px-4 py-2 bg-gray-50 items-center">
                  <span className="text-xs text-gray-500 col-span-3">Session total</span>
                  <span className="text-xs text-gray-500 text-right">{sessionHands}</span>
                  <span className={`text-xs font-semibold text-right ${sessionNet > 0 ? 'text-positive' : sessionNet < 0 ? 'text-negative' : 'text-gray-900'}`}>
                    {sign(sessionNet)}
                  </span>
                  <span className="text-xs text-gray-300 text-right">—</span>
                  <span className="text-xs text-gray-300 text-right">—</span>
                  <span className="text-xs text-gray-400 text-right">${sessionRake.toFixed(2)}</span>
                  <div className="flex justify-end">
                    <button
                      onClick={() => onView(recordId, null)}
                      className="text-xs text-gray-400 hover:text-brand transition-colors"
                    >
                      All →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Lifetime total */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-[140px_90px_110px_60px_100px_80px_80px_64px_80px] px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500 col-span-3 font-semibold">Lifetime total</span>
            <span className="text-xs text-gray-600 text-right font-semibold">{totals.hands}</span>
            <span className={`text-xs font-semibold text-right ${totals.net > 0 ? 'text-positive' : totals.net < 0 ? 'text-negative' : 'text-gray-900'}`}>
              {sign(totals.net)}
            </span>
            <span className="text-xs text-gray-300 text-right">—</span>
            <span className="text-xs text-gray-300 text-right">—</span>
            <span className="text-xs text-gray-500 text-right">${totals.rake.toFixed(2)}</span>
            <span></span>
          </div>
        )}
      </div>
    </div>
  )
}
