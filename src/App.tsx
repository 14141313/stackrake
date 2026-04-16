import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { splitHands } from './lib/splitHands'
import { parseSessionHand } from './lib/parseSessionHand'
import { analyseSession } from './lib/analyseSession'
import { rawToHand, handToRaw, createRecord, loadCloudRecords, saveCloudRecord, deleteCloudRecord, loadGemSnapshots, shouldShowGemCheckIn } from './lib/storage'
import { DEFAULT_TIER, type TierName } from './lib/tiers'
import type { SessionRecord, SessionResult, GemSnapshot } from './lib/types'
import { SessionLibrary } from './components/SessionLibrary'
import { LifetimeDashboard } from './components/LifetimeDashboard'
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
    Promise.all([loadCloudRecords(), loadGemSnapshots()])
      .then(([recs, snaps]) => {
        setRecords(recs)
        setGemSnapshots(snaps)
        setShowGemCheckIn(shouldShowGemCheckIn(snaps))
      })
      .catch(err => setCloudError(err.message ?? 'Failed to load data'))
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
      const base = createRecord(newHands, names)
      record = {
        ...base,
        id: overlappingId,
        hands: [...existingRec.hands, ...trulyNewRaw],
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
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <p className="text-gray-500 font-mono text-sm animate-pulse">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg text-gray-100">
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
          <span className="text-xs font-mono text-gray-600">{user.email}</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSettings(true)}
              className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors"
            >
              Settings
            </button>
            <button
              onClick={handleSignOut}
              className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Cloud error banner */}
        {cloudError && (
          <div className="mb-4 px-3 py-2 rounded bg-red-950/30 border border-red-900/40 text-xs text-red-400 font-mono flex items-center justify-between">
            <span>{cloudError}</span>
            <button onClick={() => setCloudError(null)} className="ml-4 hover:text-red-300">✕</button>
          </div>
        )}

        {/* Parsing spinner */}
        {uploading && (
          <div className="flex items-center justify-center min-h-[55vh]">
            <p className="text-gray-400 font-mono text-sm animate-pulse">Parsing files…</p>
          </div>
        )}

        {/* Library / Dashboard view */}
        {!uploading && view === 'library' && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`rounded-xl transition-all ${dragging ? 'ring-2 ring-accent/40 bg-accent/5' : ''}`}
          >
            {records.length > 0 ? (
              <LifetimeDashboard
                records={records}
                snapshots={gemSnapshots}
                tier={tier}
                onView={handleView}
                onDelete={handleDelete}
                onUpload={() => inputRef.current?.click()}
              />
            ) : (
              <SessionLibrary
                records={records}
                onView={handleView}
                onDelete={handleDelete}
                onUpload={() => inputRef.current?.click()}
              />
            )}
          </div>
        )}

        {/* Session detail view */}
        {!uploading && view === 'session' && activeResult && rec !== null && (
          <>
            {/* Nav bar */}
            <div className="flex items-center justify-between mb-6 text-xs font-mono">
              <button
                onClick={() => setView('library')}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                ← Sessions
              </button>

              <div className="flex items-center gap-2">
                {/* Stake filter tabs (only if session has multiple stakes) */}
                {activeStakes.length > 1 && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setActiveStake(null)}
                      className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                        activeStake === null
                          ? 'border-accent text-accent bg-accent/10'
                          : 'border-gray-700 text-gray-500 hover:border-gray-500'
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
                          className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                            activeStake === key
                              ? 'border-accent text-accent bg-accent/10'
                              : 'border-gray-700 text-gray-500 hover:border-gray-500'
                          }`}
                        >
                          ${sb}/${bb}
                        </button>
                      )
                    })}
                  </div>
                )}

                <span className="text-gray-700 ml-2">
                  {rec.fileNames.length} file{rec.fileNames.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setView('library')}
                  className="text-gray-600 hover:text-gray-400 transition-colors ml-1"
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
