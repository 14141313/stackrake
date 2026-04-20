import { useState } from 'react'
import { saveGemSnapshot, monthKey, prevMonthKey } from '../lib/storage'
import type { GemSnapshot } from '../lib/types'
import { Dialog, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Field, Label, ErrorMessage } from './ui/fieldset'

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
    <Dialog open={true} onClose={onDismiss}>

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1">
          <DialogTitle>Monthly GEM Check-in</DialogTitle>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
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
        <Field>
          <Label className="text-xs text-gray-600">
            Current GEM balance <span className="text-gray-400">(as of today)</span>
          </Label>
          <Input
            type="number"
            min="0"
            required
            placeholder="e.g. 12500"
            value={balance}
            onChange={e => setBalance(e.target.value)}
          />
        </Field>

        {/* Redeemed last month */}
        <Field>
          <Label className="text-xs text-gray-600">
            GEMs redeemed in {monthLabel(prevMonth)} <span className="text-gray-400">(enter 0 if none)</span>
          </Label>
          <Input
            type="number"
            min="0"
            placeholder="e.g. 5000"
            value={redeemed}
            onChange={e => setRedeemed(e.target.value)}
          />
        </Field>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <div className="flex gap-3 pt-1">
          <Button
            type="submit"
            variant="solid"
            disabled={loading}
            className="flex-1 py-2.5"
          >
            {loading ? 'Saving…' : 'Save Check-in'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDismiss}
            className="px-4 py-2.5"
          >
            Later
          </Button>
        </div>
      </form>

      <p className="mt-4 text-xs text-gray-400 text-center">
        GEM earnings = current balance − last month's balance + redeemed
      </p>
    </Dialog>
  )
}
