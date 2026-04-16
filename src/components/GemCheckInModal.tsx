import { useState } from 'react'
import { saveGemSnapshot, monthKey, prevMonthKey } from '../lib/storage'
import type { GemSnapshot } from '../lib/types'

interface Props {
  onComplete: (snapshot: GemSnapshot) => void
  onDismiss: () => void
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function GemCheckInModal({ onComplete, onDismiss }: Props) {
  const [balance, setBalance] = useState('')
  const [redeemed, setRedeemed] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentMonth = monthKey()
  const prevMonth = prevMonthKey()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const bal = parseInt(balance, 10)
    const red = parseInt(redeemed, 10) || 0
    if (isNaN(bal) || bal < 0) { setError('Please enter a valid GEM balance.'); return }
    if (red < 0) { setError('Redeemed GEMs cannot be negative.'); return }

    setError(null)
    setLoading(true)
    try {
      const snapshot = {
        month: currentMonth,
        balance: bal,
        redeemed: red,
        recordedAt: Date.now(),
      }
      await saveGemSnapshot(snapshot)
      onComplete({ ...snapshot, id: currentMonth }) // id filled by DB, use month as placeholder
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 shadow-2xl">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-white font-mono text-base">Monthly GEM Check-in</h2>
            <button
              onClick={onDismiss}
              className="text-gray-600 hover:text-gray-400 transition-colors text-lg leading-none"
            >
              ✕
            </button>
          </div>
          <p className="text-gray-500 text-xs">
            Log your GEM balance so we can track your actual rakeback for {monthLabel(prevMonth)}.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Current balance */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Current GEM balance <span className="text-gray-600">(as of today)</span>
            </label>
            <input
              type="number"
              min="0"
              required
              placeholder="e.g. 12500"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent/60 placeholder-gray-700"
            />
          </div>

          {/* Redeemed last month */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              GEMs redeemed in {monthLabel(prevMonth)} <span className="text-gray-600">(enter 0 if none)</span>
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 5000"
              value={redeemed}
              onChange={e => setRedeemed(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent/60 placeholder-gray-700"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded bg-accent text-black text-sm font-mono font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Saving…' : 'Save Check-in'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2.5 rounded border border-gray-700 text-gray-400 text-sm font-mono hover:border-gray-500 transition-colors"
            >
              Later
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs text-gray-700 text-center">
          GEM earnings = current balance − last month's balance + redeemed
        </p>
      </div>
    </div>
  )
}
