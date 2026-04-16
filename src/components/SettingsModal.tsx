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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-mono text-base">Account Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-400 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Account info */}
        <div className="mb-6 pb-6 border-b border-gray-800">
          <p className="text-xs text-gray-500 mb-1">Signed in as</p>
          <p className="text-sm font-mono text-gray-300">{userEmail}</p>
        </div>

        {/* Ocean Rewards Tier */}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Ocean Rewards Tier</p>
          <p className="text-xs text-gray-600 mb-4">
            Drives your rakeback rate and GEM multiplier across all sessions.
            Update this whenever your tier changes.
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {OCEAN_TIERS.map(t => (
              <button
                key={t.name}
                onClick={() => { setSelectedTier(t.name); setSaved(false) }}
                className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                  selectedTier === t.name
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
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
              <div className="p-3 rounded bg-[#0f0f0f] border border-gray-800 text-xs font-mono mb-4">
                <span className="text-accent">{selectedTier}</span>
                <span className="text-gray-600 mx-2">·</span>
                <span className="text-gray-400">{Math.round(cfg.pct * 100)}% rakeback</span>
                <span className="text-gray-600 mx-2">·</span>
                <span className="text-gray-400">x{cfg.multiplier} GEM multiplier</span>
              </div>
            )
          })()}

          {hasChanged && (
            <p className="text-xs text-yellow-600 mb-3">
              Changing tier recalculates rakeback across all your sessions immediately.
            </p>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded px-3 py-2 mb-3">
              {error}
            </p>
          )}

          {saved && !hasChanged && (
            <p className="text-xs text-accent mb-3">✓ Tier saved</p>
          )}

          <button
            onClick={handleSave}
            disabled={loading || (!hasChanged && !saved) || (saved && !hasChanged)}
            className="w-full py-2.5 rounded bg-accent text-black text-sm font-mono font-semibold hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Saving…' : saved && !hasChanged ? '✓ Saved' : 'Save Tier'}
          </button>
        </div>
      </div>
    </div>
  )
}
