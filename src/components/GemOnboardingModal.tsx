import { useState } from 'react'
import { saveGemSnapshot, monthKey } from '../lib/storage'
import { OCEAN_TIERS, DEFAULT_TIER, type TierName } from '../lib/tiers'
import type { GemSnapshot } from '../lib/types'

interface Props {
  onComplete: (snapshot: GemSnapshot, tier: TierName) => void
}

type Step = 'tier' | 'explain' | 'form'

export function GemOnboardingModal({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('tier')
  const [selectedTier, setSelectedTier] = useState<TierName>(DEFAULT_TIER)
  const [balance, setBalance] = useState('')
  const [redeemed, setRedeemed] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        month: monthKey(),
        balance: bal,
        redeemed: red,
        recordedAt: Date.now(),
      }
      await saveGemSnapshot(snapshot)
      onComplete({ ...snapshot, id: snapshot.month }, selectedTier)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 shadow-2xl">

        {/* Step 1: Tier selection */}
        {step === 'tier' && (
          <>
            <div className="mb-6">
              <h2 className="text-white font-mono text-base mb-1">Your Ocean Rewards tier</h2>
              <p className="text-gray-500 text-xs mb-4">
                Select your current tier — this sets your rakeback rate and GEM multiplier.
                You can update it anytime in account settings.
              </p>
              <div className="flex flex-wrap gap-2">
                {OCEAN_TIERS.map(t => (
                  <button
                    key={t.name}
                    onClick={() => setSelectedTier(t.name)}
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
              {(() => {
                const cfg = OCEAN_TIERS.find(t => t.name === selectedTier)!
                return (
                  <div className="mt-4 p-3 rounded bg-[#0f0f0f] border border-gray-800 text-xs font-mono">
                    <span className="text-accent">{selectedTier}</span>
                    <span className="text-gray-600 mx-2">·</span>
                    <span className="text-gray-400">{Math.round(cfg.pct * 100)}% rakeback</span>
                    <span className="text-gray-600 mx-2">·</span>
                    <span className="text-gray-400">x{cfg.multiplier} GEM multiplier</span>
                  </div>
                )
              })()}
            </div>
            <button
              onClick={() => setStep('explain')}
              className="w-full py-2.5 rounded bg-accent text-black text-sm font-mono font-semibold hover:bg-accent/90 transition-colors"
            >
              Next →
            </button>
          </>
        )}

        {/* Step 2: Explain GEM baseline */}
        {step === 'explain' && (
          <>
            <div className="mb-6">
              <button
                onClick={() => setStep('tier')}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors mb-3 block"
              >
                ← Back
              </button>
              <h2 className="text-white font-mono text-base mb-3">One last thing</h2>
              <div className="space-y-3 text-sm text-gray-400 leading-relaxed">
                <p>
                  Your session stats look great — but your <span className="text-white">true winrate</span> includes rakeback, and GEMs are a big part of that on GGPoker.
                </p>
                <p>
                  To calculate it accurately, we need to know your <span className="text-white">current GEM balance</span>. This gives us a baseline.
                </p>
                <p>
                  From <span className="text-white">next month onwards</span>, we'll ask you once at the start of each month — your new balance and whether you redeemed any GEMs. That's it.
                </p>
                <p className="text-gray-600 text-xs">
                  You only need to do this monthly. We handle the maths.
                </p>
              </div>
            </div>
            <button
              onClick={() => setStep('form')}
              className="w-full py-2.5 rounded bg-accent text-black text-sm font-mono font-semibold hover:bg-accent/90 transition-colors"
            >
              Set my baseline →
            </button>
          </>
        )}

        {/* Step 3: GEM baseline form */}
        {step === 'form' && (
          <>
            <div className="mb-5">
              <button
                onClick={() => setStep('explain')}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors mb-3 block"
              >
                ← Back
              </button>
              <h2 className="text-white font-mono text-base mb-1">Your GEM baseline</h2>
              <p className="text-gray-500 text-xs">
                Just this once — next month we'll only ask for your updated balance and any redemptions.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Current GEM balance
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  autoFocus
                  placeholder="e.g. 8500"
                  value={balance}
                  onChange={e => setBalance(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent/60 placeholder-gray-700"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  GEMs redeemed so far this month <span className="text-gray-600">(enter 0 if none)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
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

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded bg-accent text-black text-sm font-mono font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Saving…' : 'Save baseline'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
