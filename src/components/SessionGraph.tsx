import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import type { SessionResult } from '../lib/types'

interface Props {
  result: SessionResult
  title?: string
}

type DataPoint = SessionResult['cumulativePnL'][number]

function CustomTooltip({
  active,
  payload,
  hasEV,
}: {
  active?: boolean
  payload?: Array<{ payload: DataPoint; dataKey: string; color: string; value: number }>
  hasEV: boolean
}) {
  if (!active || !payload?.length || !payload[0].payload) return null
  const d = payload[0].payload

  const netColor = d.cumNet >= 0 ? '#16a34a' : '#dc2626'
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}$${Math.abs(n).toFixed(2)}`

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-lg px-3 py-2 text-xs space-y-1">
      <div className="text-gray-500">Hand #{d.handIndex}</div>
      <div style={{ color: netColor }} className="text-sm font-semibold">
        {fmt(d.cumNet)} <span className="text-gray-400 font-normal text-xs">actual</span>
      </div>
      {hasEV && d.cumEV !== d.cumNet && (
        <div style={{ color: '#7F77DD' }} className="text-sm font-semibold">
          {fmt(d.cumEV)} <span className="text-gray-400 font-normal text-xs">EV</span>
        </div>
      )}
      <div className="text-gray-400">{d.tableId}</div>
    </div>
  )
}

export function SessionGraph({ result, title = 'Session Graph' }: Props) {
  const data = result.cumulativePnL
  if (data.length === 0) return null

  const hasEV = result.hasEVData

  const allValues = data.flatMap(d => hasEV ? [d.cumNet, d.cumEV] : [d.cumNet])
  const maxAbs = allValues.reduce((m, v) => Math.max(m, Math.abs(v)), 0.01)
  const yDomain = [-maxAbs * 1.15, maxAbs * 1.15]

  const finalNet = data[data.length - 1]?.cumNet ?? 0
  const actualColor = finalNet >= 0 ? '#16a34a' : '#dc2626'
  const evColor = '#7F77DD'

  return (
    <div className="bg-white rounded-xl p-6 mb-6 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs text-gray-500 uppercase tracking-wider">{title}</h2>
        {hasEV && (
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5" style={{ backgroundColor: actualColor }} />
              <span className="text-gray-600">Actual</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed" style={{ borderColor: evColor }} />
              <span className="text-gray-600">EV</span>
            </span>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 40, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="handIndex"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
            label={{ value: 'Hand', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 11 }}
          />
          <YAxis
            domain={yDomain}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
            tickFormatter={v => `$${v.toFixed(0)}`}
            width={50}
          />
          <Tooltip content={<CustomTooltip hasEV={hasEV} />} />
          <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="4 2" />

          {/* Actual P&L line */}
          <Line
            type="monotone"
            dataKey="cumNet"
            stroke={actualColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: actualColor, stroke: '#ffffff', strokeWidth: 2 }}
            isAnimationActive={false}
          />

          {/* EV line — only rendered when all-in EV data exists */}
          {hasEV && (
            <Line
              type="monotone"
              dataKey="cumEV"
              stroke={evColor}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 3, fill: evColor, stroke: '#ffffff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
