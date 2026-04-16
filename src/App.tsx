import { useCallback, useEffect, useRef, useState } from 'react'
import { splitHands } from './lib/splitHands'
import { parseSessionHand } from './lib/parseSessionHand'
import { analyseSession } from './lib/analyseSession'
import { rawToHand, createRecord, loadCloudRecords, saveCloudRecord, deleteCloudRecord } from './lib/storage'
import type { SessionRecord, SessionResult } from './lib/types'
import { SessionLibrary } from './components/SessionLibrary'
import { SummaryStrip } from './components/SummaryStrip'
import { SessionGraph } from './components/SessionGraph'
import { PositionTable } from './components/PositionTable'
import { RakebackPanel } from './components/RakebackPanel'
import { AuthPage } from './components/AuthPage'
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

  // ── Load cloud records when user logs in ────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setRecords([])
      return
    }
    setCloudError(null)
    loadCloudRecords()
      .then(setRecords)
      .catch(err => setCloudError(err.message ?? 'Failed to load sessions'))
  }, [user])

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

    const record = createRecord(valid, names)

    try {
      await saveCloudRecord(record)
      const updated = await loadCloudRecords()
      setRecords(updated)
    } catch (err: unknown) {
      setCloudError(err instanceof Error ? err.message : 'Failed to save session')
    }

    setActiveRecordId(record.id)
    setActiveStake(null)
    setUploading(false)
    setView('session')
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files)
  }, [processFiles])

  // ── Derived: active session result ─────────────────────────────────────────
  const activeResult: SessionResult | null = (() => {
    if (!activeRecordId) return null
    const rec = records.find(r => r.id === activeRecordId)
    if (!rec) return null
    let hands = rec.hands.map(rawToHand)
    if (activeStake) hands = hands.filter(h => `${h.stakes.sb}/${h.stakes.bb}` === activeStake)
    return hands.length > 0 ? analyseSession(hands) : null
  })()

  // ── Derived: stake tabs for active session ─────────────────────────────────
  const activeStakes: string[] = (() => {
    if (!activeRecordId) return []
    const rec = records.find(r => r.id === activeRecordId)
    if (!rec) return []
    const set = new Set(rec.hands.map(h => `${h.stakes.sb}/${h.stakes.bb}`))
    return [...set].sort((a, b) => {
      const [, abb] = a.split('/').map(Number)
      const [, bbb] = b.split('/').map(Number)
      return bbb - abb
    })
  })()

  const rec = records.find(r => r.id === activeRecordId)

  // ── Library handlers ────────────────────────────────────────────────────────
  const handleView = (recordId: string, stakeKey: string | null) => {
    setActiveRecordId(recordId)
    setActiveStake(stakeKey)
    setView('session')
  }

  const handleDelete = async (recordId: string) => {
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

        {/* Header bar with user info + sign out */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs font-mono text-gray-600">{user.email}</span>
          <button
            onClick={handleSignOut}
            className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors"
          >
            Sign out
          </button>
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

        {/* Library view */}
        {!uploading && view === 'library' && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`rounded-xl transition-all ${dragging ? 'ring-2 ring-accent/40 bg-accent/5' : ''}`}
          >
            <SessionLibrary
              records={records}
              onView={handleView}
              onDelete={handleDelete}
              onUpload={() => inputRef.current?.click()}
            />
          </div>
        )}

        {/* Session detail view */}
        {!uploading && view === 'session' && activeResult && rec && (
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
            <RakebackPanel result={activeResult} />
          </>
        )}
      </div>
    </div>
  )
}
