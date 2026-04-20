import { useState } from 'react'
import { OCEAN_TIERS, type TierName } from '../lib/tiers'
import { Dialog, DialogTitle, DialogBody, DialogActions } from './ui/dialog'
import { Button } from './ui/button'
import { ErrorMessage } from './ui/fieldset'
import { recalculateAll } from '../lib/recalculate'
import { saveCloudRecord } from '../lib/storage'
import type { SessionRecord } from '../lib/types'

interface Props {
  currentTier: TierName
  userEmail: string
  records: SessionRecord[]
  onRecordsUpdated: (records: SessionRecord[]) => void
  onSave: (tier: TierName) => Promise<void>
  onClose: () => void
}

export function SettingsModal({ currentTier, userEmail, records, onRecordsUpdated, onSave, onClose }: Props) {
  const [selectedTier, setSelectedTier] = useState<TierName>(currentTier)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [recalcLoading, setRecalcLoading] = useState(false)
  const [recalcDone, setRecalcDone] = useState(false)
  const [recalcError, setRecalcError] = useState<string | null>(null)

  const hasChanged = selectedTier !== currentTier

  async function handleSave() {
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      await onSave(selectedTier)
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRecalculate() {
    setRecalcLoading(true)
    setRecalcDone(false)
    setRecalcError(null)
    try {
      const updated = await recalculateAll(records, saveCloudRecord)
      onRecordsUpdated(updated)
      setRecalcDone(true)
    } catch (err: unknown) {
      setRecalcError(err instanceof Error ? err.message : 'Recalculation failed.')
    } finally {
      setRecalcLoading(false)
    }
  }

  return (
    <Dialog open={true} onClose={onClose}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <DialogTitle>Account Settings</DialogTitle>
        <Button
          variant="plain"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none px-2 py-1"
        >
          ✕
        </Button>
      </div>

      <DialogBody className="mt-0">
        {/* Account info */}
        <div className="mb-6 pb-6 border-b border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Signed in as</p>
          <p className="text-sm text-gray-700">{userEmail}</p>
        </div>

        {/* Ocean Rewards Tier */}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Ocean Rewards Tier</p>
          <p className="text-xs text-gray-500 mb-4">
            Drives your rakeback rate and GEM multiplier across all sessions.
            Update this whenever your tier changes.
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {OCEAN_TIERS.map(t => (
              <button
                key={t.name}
                onClick={() => { setSelectedTier(t.name); setSaved(false) }}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  selectedTier === t.name
                    ? 'border-brand text-brand bg-brand-light'
                    : 'border-gray-200 text-gray-500 hover:border-brand/50 hover:text-brand'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          {/* Selected tier details */}
          {(() => {
            const cfg = OCEAN_TIERS.find(t => t.name === selectedTier)!
            return (
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs mb-4">
                <span className="text-brand">{selectedTier}</span>
                <span className="text-gray-400 mx-2">·</span>
                <span className="text-gray-600">{Math.round(cfg.pct * 100)}% rakeback</span>
                <span className="text-gray-400 mx-2">·</span>
                <span className="text-gray-600">x{cfg.multiplier} GEM multiplier</span>
              </div>
            )
          })()}

          {hasChanged && (
            <p className="text-xs text-amber-600 mb-3">
              Changing tier recalculates rakeback across all your sessions immediately.
            </p>
          )}

          {error && <ErrorMessage className="mb-3">{error}</ErrorMessage>}

          {saved && !hasChanged && (
            <p className="text-xs text-brand mb-3">✓ Tier saved</p>
          )}
        </div>

        {/* Data maintenance */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Data</p>
          <p className="text-xs text-gray-500 mb-4">
            Recompute session durations and derived metrics from raw hand data.
            Safe to run at any time — does not modify your hand history.
          </p>

          {recalcError && <ErrorMessage className="mb-3">{recalcError}</ErrorMessage>}
          {recalcDone && !recalcLoading && (
            <p className="text-xs text-brand mb-3">✓ All sessions recalculated</p>
          )}

          <Button
            variant="outline"
            onClick={handleRecalculate}
            disabled={recalcLoading || records.length === 0}
            className="text-xs"
          >
            {recalcLoading ? 'Recalculating…' : 'Recalculate Data'}
          </Button>
        </div>
      </DialogBody>

      <DialogActions>
        <Button
          variant="solid"
          onClick={handleSave}
          disabled={loading || (!hasChanged && !saved) || (saved && !hasChanged)}
        >
          {loading ? 'Saving…' : saved && !hasChanged ? '✓ Saved' : 'Save Tier'}
        </Button>
        <Button variant="plain" onClick={onClose}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  )
}
