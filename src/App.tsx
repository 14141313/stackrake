import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { splitHands } from './lib/splitHands'
import { parseSessionHand } from './lib/parseSessionHand'
import { analyseSession } from './lib/analyseSession'
import { rawToHand, handToRaw, createRecord, loadCloudRecords, saveCloudRecord, deleteCloudRecord, loadGemSnapshots, shouldShowGemCheckIn } from './lib/storage'
import { calcDurationMinutes } from './lib/recalculate'
import { DEFAULT_TIER, type TierName } from './lib/tiers'
import type { SessionRecord, SessionResult, GemSnapshot } from './lib/types'
import { SessionLibrary } from './components/SessionLibrary'
import { LifetimeDashboard } from './components/LifetimeDashboard'
import { Button } from './components/ui/button'
import { SummaryStrip } from './components/SummaryStrip'
import { SessionGraph } from './components/SessionGraph'
import { PositionTable } from './components/PositionTable'
import { RakebackPanel } from './components/RakebackPanel'
import { AuthPage } from './components/AuthPage'
import { GemCheckInModal } from './components/GemCheckInModal'
import { GemOnboardingModal } from './components/GemOnboardingModal'
import { SettingsModal } from './components/SettingsModal'
import { supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'

type View = 'library' | 'session'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [view, setView] = useState<View>('library')
  const [records, setRecords] = useState<SessionRecord[]>([])
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null)
  const [activeStake, setActiveStake] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [gemSnapshots, setGemSnapshots] = useState<GemSnapshot[]>([])
  const [showGemCheckIn, setShowGemCheckIn] = useState(false)
  const [showGemOnboarding, setShowGemOnboarding] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [tier, setTier] = useState<TierName>(DEFAULT_TIER)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Auth state ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Load cloud records + GEM snapshots when user logs in ───────────────────
  useEffect(() => {
    if (!user) {
      setRecords([])
      setGemSnapshots([])
      setShowGemCheckIn(false)
      setTier(DEFAULT_TIER)
      return
    }
    // Restore tier from user metadata
    const savedTier = user.user_metadata?.tier as TierName | undefined
    if (savedTier) setTier(savedTier)

    setCloudError(null)
    setDataLoading(true)
    Promise.all([loadCloudRecords(), loadGemSnapshots()])
      .then(([recs, snaps]) => {
        // Correct durationMinutes for every record using the canonical
        // gap-based logic. This silently fixes legacy records that were stored
        // with the old first-to-last method — no user action required.
        const corrected = recs.map(rec => {
          const correct = calcDurationMinutes(rec.hands)
          return rec.durationMinutes === correct ? rec : { ...rec, durationMinutes: correct }
        })
        setRecords(corrected)
        setGemSnapshots(snaps)
        setShowGemCheckIn(shouldShowGemCheckIn(snaps))

        // Persist any records whose stored value differed. Fire-and-forget:
        // the UI already has correct values in state.
        const stale = corrected.filter((rec, i) => rec.durationMinutes !== recs[i].durationMinutes)
        if (stale.length > 0) {
          Promise.all(stale.map(saveCloudRecord)).catch(err =>
            console.error('[stackrake] Failed to persist corrected durations:', err)
          )
        }
      })
      .catch(err => setCloudError(err.message ?? 'Failed to load data'))
      .finally(() => setDataLoading(false))
  }, [user])

  // ── Session overlap detection ───────────────────────────────────────────────
  // Finds an existing session record that shares ≥10% of hand IDs with the
  // provided set. Used to detect when an upload is extending an existing session.
  function findOverlappingRecord(handIds: Set<string>): string | null {
    const overlapCount = new Map<string, number>()
    for (const rec of records) {
      for (const h of rec.hands) {
        if (handIds.has(h.handId)) {
          overlapCount.set(rec.id, (overlapCount.get(rec.id) ?? 0) + 1)
        }
      }
    }
    let bestId: string | null = null
    let bestCount = 0
    for (const [id, count] of overlapCount) {
      if (count > bestCount) { bestCount = count; bestId = id }
    }
    return bestId && bestCount / handIds.size >= 0.1 ? bestId : null
  }

  // ── Process uploaded files ──────────────────────────────────────────────────
  const processFiles = useCallback(async (fileList: FileList) => {
    const names: string[] = []
    const texts: string[] = []
    for (const file of Array.from(fileList)) {
      if (!file.name.endsWith('.txt')) continue
      names.push(file.name)
      texts.push(await file.text())
    }
    if (names.length === 0) return

    setUploading(true)
    await new Promise(r => setTimeout(r, 20))

    const combined = texts.join('\n')
    const handStrings = splitHands(combined)
    const parsed = handStrings.map(parseSessionHand)
    const valid = parsed.filter((h): h is NonNullable<typeof h> => h !== null)

    if (valid.length === 0) { setUploading(false); return }

    // ── Hand-level deduplication ──────────────────────────────────────────────
    // Build a flat set of every hand ID already stored for this user
    const existingHandIds = new Set(records.flatMap(r => r.hands.map(h => h.handId)))
    // Keep only hands that are genuinely new
    const newHands = valid.filter(h => !existingHandIds.has(h.handId))
    // Nothing new at all — bail silently, no error, no notification
    if (newHands.length === 0) { setUploading(false); return }

    // ── Session merge / create ────────────────────────────────────────────────
    // Run overlap check on the full parsed list so we can detect if this upload
    // is extending an existing session even when most hands are already stored.
    const isFirstUpload = records.length === 0
    const allParsedIds = new Set(valid.map(h => h.handId))
    const overlappingId = findOverlappingRecord(allParsedIds)

    let record: SessionRecord
    if (overlappingId) {
      // Merge the new hands into the existing session record
      const existingRec = records.find(r => r.id === overlappingId)!
      const existingIds = new Set(existingRec.hands.map(h => h.handId))
      const trulyNewRaw = newHands
        .filter(h => !existingIds.has(h.handId))
        .map(handToRaw)
      const mergedRaw = [...existingRec.hands, ...trulyNewRaw]
      const base = createRecord(newHands, names)
      // Recompute duration for the merged set using the same gap-based logic
      // as createRecord — so adding hands to an existing session never inflates
      // the duration with calendar gaps.
      const mergedHands = mergedRaw.map(rawToHand)
      const mergedDuration = createRecord(mergedHands, base.fileNames).durationMinutes
      record = {
        ...base,
        id: overlappingId,
        durationMinutes: mergedDuration,
        hands: mergedRaw,
      }
    } else {
      // Brand-new session — store only the new hands, not raw file content
      record = createRecord(newHands, names)
    }

    try {
      await saveCloudRecord(record)
      const updated = await loadCloudRecords()
      setRecords(updated)
      setActiveRecordId(record.id)
      setActiveStake(null)
      setView('session')
      if (isFirstUpload && gemSnapshots.length === 0) {
        setShowGemOnboarding(true)
      }
    } catch (err: unknown) {
      setCloudError(err instanceof Error ? err.message : 'Failed to save session')
    }

    setUploading(false)
  }, [records, gemSnapshots])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files)
  }, [processFiles])

  // ── Derived: active record + result (memoised to avoid re-running Monte Carlo) ─
  const rec = useMemo(
    () => records.find(r => r.id === activeRecordId) ?? null,
    [records, activeRecordId]
  )

  const activeResult: SessionResult | null = useMemo(() => {
    if (!rec) return null
    let hands = rec.hands.map(rawToHand)
    if (activeStake) hands = hands.filter(h => `${h.stakes.sb}/${h.stakes.bb}` === activeStake)
    return hands.length > 0 ? analyseSession(hands) : null
  }, [rec, activeStake])

  const activeStakes: string[] = useMemo(() => {
    if (!rec) return []
    const set = new Set(rec.hands.map(h => `${h.stakes.sb}/${h.stakes.bb}`))
    return [...set].sort((a, b) => {
      const [, abb] = a.split('/').map(Number)
      const [, bbb] = b.split('/').map(Number)
      return bbb - abb
    })
  }, [rec])

  // ── Library handlers ────────────────────────────────────────────────────────
  const handleView = (recordId: string, stakeKey: string | null) => {
    setActiveRecordId(recordId)
    setActiveStake(stakeKey)
    setView('session')
  }

  const handleDelete = async (recordId: string) => {
    if (!window.confirm('Delete this session? This cannot be undone.')) return
    try {
      await deleteCloudRecord(recordId)
      const updated = await loadCloudRecords()
      setRecords(updated)
      if (activeRecordId === recordId) { setActiveRecordId(null); setView('library') }
    } catch (err: unknown) {
      setCloudError(err instanceof Error ? err.message : 'Failed to delete session')
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setRecords([])
    setActiveRecordId(null)
    setView('library')
  }

  const saveTierToAccount = async (newTier: TierName) => {
    const { data, error } = await supabase.auth.updateUser({ data: { tier: newTier } })
    if (error) throw error
    setTier(newTier)
    // Sync local state with the updated user object if returned
    if (data.user) {
      const confirmed = data.user.user_metadata?.tier as TierName | undefined
      if (confirmed) setTier(confirmed)
    }
  }

  // ── Loading / Auth gates ────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-500 text-sm animate-pulse">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {showGemOnboarding && (
        <GemOnboardingModal
          onComplete={async (snapshot, selectedTier) => {
            setGemSnapshots(prev => {
              const filtered = prev.filter(s => s.month !== snapshot.month)
              return [snapshot, ...filtered]
            })
            setShowGemOnboarding(false)
            setShowGemCheckIn(false) // don't double-prompt this month
            // Persist tier to user account
            await saveTierToAccount(selectedTier)
          }}
        />
      )}
      {showSettings && user && (
        <SettingsModal
          currentTier={tier}
          userEmail={user.email ?? ''}
          records={records}
          onRecordsUpdated={setRecords}
          onSave={saveTierToAccount}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showGemCheckIn && !showGemOnboarding && (
        <GemCheckInModal
          onComplete={snapshot => {
            setGemSnapshots(prev => {
              const filtered = prev.filter(s => s.month !== snapshot.month)
              return [snapshot, ...filtered]
            })
            setShowGemCheckIn(false)
          }}
          onDismiss={() => setShowGemCheckIn(false)}
        />
      )}
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Hidden global file input */}
        <input
          ref={inputRef}
          type="file"
          accept=".txt"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files?.length) processFiles(e.target.files) }}
        />

        {/* Header bar with user info + settings + sign out */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs text-gray-400">{user.email}</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSettings(true)}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Settings
            </button>
            <button
              onClick={handleSignOut}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Cloud error banner */}
        {cloudError && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 flex items-center justify-between">
            <span>{cloudError}</span>
            <button onClick={() => setCloudError(null)} className="ml-4 hover:text-red-500">✕</button>
          </div>
        )}

        {/* Parsing spinner */}
        {uploading && (
          <div className="flex items-center justify-center min-h-[55vh]">
            <p className="text-gray-400 text-sm animate-pulse">Parsing files…</p>
          </div>
        )}

        {/* Library / Dashboard view */}
        {!uploading && view === 'library' && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`rounded-xl transition-all ${dragging ? 'ring-2 ring-brand/40 bg-brand-light/50' : ''}`}
          >
            {dataLoading ? (
              <div className="flex items-center justify-center min-h-[55vh]">
                <p className="text-gray-400 text-sm animate-pulse">Loading…</p>
              </div>
            ) : records.length > 0 ? (
              <LifetimeDashboard
                records={records}
                snapshots={gemSnapshots}
                tier={tier}
                onView={handleView}
                onUpload={() => inputRef.current?.click()}
              />
            ) : (
              <SessionLibrary
                records={records}
                onView={handleView}
                onUpload={() => inputRef.current?.click()}
              />
            )}

          </div>
        )}

        {/* Session detail view */}
        {!uploading && view === 'session' && activeResult && rec !== null && (
          <>
            {/* Nav bar */}
            <div className="flex items-center justify-between mb-6 text-xs">
              <Button
                variant="plain"
                onClick={() => setView('library')}
                className="text-gray-500 hover:text-gray-700 text-xs"
              >
                ← Sessions
              </Button>

              <div className="flex items-center gap-2">
                {/* Stake filter tabs (only if session has multiple stakes) */}
                {activeStakes.length > 1 && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setActiveStake(null)}
                      className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                        activeStake === null
                          ? 'border-brand text-brand bg-brand-light'
                          : 'border-gray-200 text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      All
                    </button>
                    {activeStakes.map(key => {
                      const [sb, bb] = key.split('/').map(Number)
                      return (
                        <button
                          key={key}
                          onClick={() => setActiveStake(key)}
                          className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                            activeStake === key
                              ? 'border-brand text-brand bg-brand-light'
                              : 'border-gray-200 text-gray-500 hover:border-gray-400'
                          }`}
                        >
                          ${sb}/${bb}
                        </button>
                      )
                    })}
                  </div>
                )}

                <span className="text-gray-300 ml-2">
                  {rec.fileNames.length} file{rec.fileNames.length !== 1 ? 's' : ''}
                </span>
                <Button
                  variant="plain"
                  onClick={() => handleDelete(rec.id)}
                  className="text-xs text-gray-400 hover:text-negative px-2 py-1"
                >
                  Delete session
                </Button>
                <button
                  onClick={() => setView('library')}
                  className="text-gray-400 hover:text-gray-700 transition-colors ml-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <SummaryStrip result={activeResult} />
            <SessionGraph result={activeResult} />
            <PositionTable result={activeResult} />
            <RakebackPanel result={activeResult} snapshots={gemSnapshots} tier={tier} />
          </>
        )}
      </div>
    </div>
  )
}
