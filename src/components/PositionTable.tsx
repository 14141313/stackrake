import type { SessionResult, Position } from '../lib/types'

interface Props {
  result: SessionResult
}

const POSITIONS: Position[] = ['BTN', 'CO', 'MP', 'UTG', 'SB', 'BB']

function netColor(n: number): string {
  if (n > 0) return 'text-positive'
  if (n < 0) return 'text-negative'
  return 'text-gray-500'
}

function sign(n: number, decimals = 2): string {
  if (n === 0) return '—'
  return n > 0 ? `+$${n.toFixed(decimals)}` : `-$${Math.abs(n).toFixed(decimals)}`
}

function bbPer100(net: number, bb: number, hands: number): string {
  if (hands === 0 || bb === 0) return '—'
  const val = (net / bb / hands) * 100
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}`
}

export function PositionTable({ result }: Props) {
  const { positionBreakdown, stakes, handsPlayed } = result

  // Use primary BB
  const primaryBB = stakes.length > 0 ? stakes[0].bb : 0.5

  const total = {
    hands: handsPlayed,
    net: result.netResult,
  }

  return (
    <div className="bg-white rounded-xl p-6 mb-6 border border-gray-100 shadow-sm">
      <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-4">Win / Loss by Position</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="text-left pb-2 pr-4">Pos</th>
              <th className="text-right pb-2 pr-4">Hands</th>
              <th className="text-right pb-2 pr-4">VPIP</th>
              <th className="text-right pb-2 pr-4">Net $</th>
              <th className="text-right pb-2 pr-4">BB/100</th>
              <th className="text-right pb-2">Rake</th>
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map(pos => {
              const s = positionBreakdown[pos]
              if (s.hands === 0) return null
              const vpipPct = s.hands > 0 ? Math.round((s.vpipHands / s.hands) * 100) : 0
              return (
                <tr key={pos} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-2 pr-4 text-gray-700 font-semibold">{pos}</td>
                  <td className="py-2 pr-4 text-right text-gray-600">{s.hands}</td>
                  <td className="py-2 pr-4 text-right text-gray-600">{vpipPct}%</td>
                  <td className={`py-2 pr-4 text-right ${netColor(s.net)}`}>{sign(s.net)}</td>
                  <td className={`py-2 pr-4 text-right ${netColor(s.net)}`}>{bbPer100(s.net, primaryBB, s.hands)}</td>
                  <td className="py-2 text-right text-brand">${s.rake.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="text-gray-600 border-t border-gray-200">
              <td className="pt-2 pr-4 text-gray-500 uppercase text-xs">Total</td>
              <td className="pt-2 pr-4 text-right">{total.hands}</td>
              <td className="pt-2 pr-4 text-right text-gray-500">
                {handsPlayed > 0 ? Math.round((result.vpipHands / handsPlayed) * 100) : 0}%
              </td>
              <td className={`pt-2 pr-4 text-right font-semibold ${netColor(total.net)}`}>
                {sign(total.net)}
              </td>
              <td className={`pt-2 pr-4 text-right font-semibold ${netColor(total.net)}`}>
                {bbPer100(total.net, primaryBB, total.hands)}
              </td>
              <td className="pt-2 text-right text-brand">${result.totalHeroRake.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
