import type { SessionResult, Position } from '../lib/types'
import { Table, TableHead, TableBody, TableFoot, TableRow, TableHeader, TableCell } from './ui/table'

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
      <Table className="w-full">
        <TableHead>
          <TableRow>
            <TableHeader className="text-left pb-2 pr-4">Pos</TableHeader>
            <TableHeader className="text-right pb-2 pr-4">Hands</TableHeader>
            <TableHeader className="text-right pb-2 pr-4">VPIP</TableHeader>
            <TableHeader className="text-right pb-2 pr-4">Net $</TableHeader>
            <TableHeader className="text-right pb-2 pr-4">BB/100</TableHeader>
            <TableHeader className="text-right pb-2">Rake</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {POSITIONS.map(pos => {
            const s = positionBreakdown[pos]
            if (s.hands === 0) return null
            const vpipPct = s.hands > 0 ? Math.round((s.vpipHands / s.hands) * 100) : 0
            return (
              <TableRow key={pos} className="border-b border-gray-50 hover:bg-gray-50">
                <TableCell className="py-2 pr-4 text-gray-700 font-semibold">{pos}</TableCell>
                <TableCell className="py-2 pr-4 text-right text-gray-600">{s.hands}</TableCell>
                <TableCell className="py-2 pr-4 text-right text-gray-600">{vpipPct}%</TableCell>
                <TableCell className={`py-2 pr-4 text-right ${netColor(s.net)}`}>{sign(s.net)}</TableCell>
                <TableCell className={`py-2 pr-4 text-right ${netColor(s.net)}`}>{bbPer100(s.net, primaryBB, s.hands)}</TableCell>
                <TableCell className="py-2 text-right text-brand">${s.rake.toFixed(2)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFoot>
          <TableRow className="text-gray-600">
            <TableCell className="pt-2 pr-4 text-gray-500 uppercase text-xs">Total</TableCell>
            <TableCell className="pt-2 pr-4 text-right">{total.hands}</TableCell>
            <TableCell className="pt-2 pr-4 text-right text-gray-500">
              {handsPlayed > 0 ? Math.round((result.vpipHands / handsPlayed) * 100) : 0}%
            </TableCell>
            <TableCell className={`pt-2 pr-4 text-right font-semibold ${netColor(total.net)}`}>
              {sign(total.net)}
            </TableCell>
            <TableCell className={`pt-2 pr-4 text-right font-semibold ${netColor(total.net)}`}>
              {bbPer100(total.net, primaryBB, total.hands)}
            </TableCell>
            <TableCell className="pt-2 text-right text-brand">${result.totalHeroRake.toFixed(2)}</TableCell>
          </TableRow>
        </TableFoot>
      </Table>
    </div>
  )
}
