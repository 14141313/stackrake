import { useState } from 'react'
import { OCEAN_TIERS, type TierName } from '../lib/tiers'

interface Props {
  currentTier: TierName
  userEmail: string
  onSave: (tier: TierName) => Promise<void>
  onClose: () => void
}

export function SettingsModal({ currentTier, userEmail, onSave, onClose }: Props) {
  const [selectedTier, setSelectedTier] = useState<TierName>(currentTier)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-gray-900 font-mono text-base">Account Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Account info */}
        <div className="mb-6 pb-6 border-b border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Signed in as</p>
          <p className="text-sm font-mono text-gray-700">{userEmail}</p>
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
                className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-colors ${
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
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs font-mono mb-4">
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

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              {error}
            </p>
          )}

          {saved && !hasChanged && (
            <p className="text-xs text-brand mb-3">✓ Tier saved</p>
          )}

          <button
            onClick={handleSave}
            disabled={loading || (!hasChanged && !saved) || (saved && !hasChanged)}
            className="w-full py-2.5 rounded-lg bg-brand text-white text-sm font-mono font-semibold hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Saving…' : saved && !hasChanged ? '✓ Saved' : 'Save Tier'}
          </button>
        </div>
      </div>
    </div>
  )
}
