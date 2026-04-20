import { useState } from 'react'
import { saveGemSnapshot, monthKey } from '../lib/storage'
import { OCEAN_TIERS, DEFAULT_TIER, type TierName } from '../lib/tiers'
import type { GemSnapshot } from '../lib/types'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Field, Label, ErrorMessage } from './ui/fieldset'

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
    <Dialog open={true} onClose={() => {}}>

      {/* Step 1: Tier selection */}
      {step === 'tier' && (
        <>
          <div className="mb-6">
            <h2 className="text-gray-900 text-base mb-1">Your Ocean Rewards tier</h2>
            <p className="text-gray-500 text-xs mb-4">
              Select your current tier — this sets your rakeback rate and GEM multiplier.
              You can update it anytime in account settings.
            </p>
            <div className="flex flex-wrap gap-2">
              {OCEAN_TIERS.map(t => (
                <button
                  key={t.name}
                  onClick={() => setSelectedTier(t.name)}
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
            {(() => {
              const cfg = OCEAN_TIERS.find(t => t.name === selectedTier)!
              return (
                <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                  <span className="text-brand">{selectedTier}</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-600">{Math.round(cfg.pct * 100)}% rakeback</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-600">x{cfg.multiplier} GEM multiplier</span>
                </div>
              )
            })()}
          </div>
          <Button
            variant="solid"
            onClick={() => setStep('explain')}
            className="w-full py-2.5"
          >
            Next →
          </Button>
        </>
      )}

      {/* Step 2: Explain GEM baseline */}
      {step === 'explain' && (
        <>
          <div className="mb-6">
            <Button
              variant="plain"
              onClick={() => setStep('tier')}
              className="text-xs text-gray-400 hover:text-gray-600 mb-3 px-0 py-0"
            >
              ← Back
            </Button>
            <h2 className="text-gray-900 text-base mb-3">One last thing</h2>
            <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
              <p>
                Your session stats look great — but your <span className="text-gray-900">true winrate</span> includes rakeback, and GEMs are a big part of that on GGPoker.
              </p>
              <p>
                To calculate it accurately, we need to know your <span className="text-gray-900">current GEM balance</span>. This gives us a baseline.
              </p>
              <p>
                From <span className="text-gray-900">next month onwards</span>, we'll ask you once at the start of each month — your new balance and whether you redeemed any GEMs. That's it.
              </p>
              <p className="text-gray-400 text-xs">
                You only need to do this monthly. We handle the maths.
              </p>
            </div>
          </div>
          <Button
            variant="solid"
            onClick={() => setStep('form')}
            className="w-full py-2.5"
          >
            Set my baseline →
          </Button>
        </>
      )}

      {/* Step 3: GEM baseline form */}
      {step === 'form' && (
        <>
          <div className="mb-5">
            <Button
              variant="plain"
              onClick={() => setStep('explain')}
              className="text-xs text-gray-400 hover:text-gray-600 mb-3 px-0 py-0"
            >
              ← Back
            </Button>
            <h2 className="text-gray-900 text-base mb-1">Your GEM baseline</h2>
            <p className="text-gray-500 text-xs">
              Just this once — next month we'll only ask for your updated balance and any redemptions.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field>
              <Label className="text-xs text-gray-600">Current GEM balance</Label>
              <Input
                type="number"
                min="0"
                required
                autoFocus
                placeholder="e.g. 8500"
                value={balance}
                onChange={e => setBalance(e.target.value)}
              />
            </Field>

            <Field>
              <Label className="text-xs text-gray-600">
                GEMs redeemed so far this month <span className="text-gray-400">(enter 0 if none)</span>
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={redeemed}
                onChange={e => setRedeemed(e.target.value)}
              />
            </Field>

            {error && <ErrorMessage>{error}</ErrorMessage>}

            <Button
              type="submit"
              variant="solid"
              disabled={loading}
              className="w-full py-2.5"
            >
              {loading ? 'Saving…' : 'Save baseline'}
            </Button>
          </form>
        </>
      )}
    </Dialog>
  )
}
