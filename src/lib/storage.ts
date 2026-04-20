import type { SessionRecord, SessionHand, RawHand, GemSnapshot } from './types'
import { supabase } from './supabase'

// ── Cloud CRUD (Supabase) ─────────────────────────────────────────────────────

export async function loadCloudRecords(): Promise<SessionRecord[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('stored_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(row => ({
    id: row.id,
    storedAt: row.stored_at,
    fileNames: row.file_names,
    site: row.site,
    // duration_minutes is NULL for legacy records (column added after initial release)
    durationMinutes: row.duration_minutes ?? 0,
    hands: row.hands as RawHand[],
  }))
}

export async function saveCloudRecord(record: SessionRecord): Promise<void> {
  const { data, error: authError } = await supabase.auth.getUser()
  if (authError || !data.user) throw new Error('Not authenticated')
  const user = data.user
  const { error } = await supabase.from('sessions').upsert({
    id: record.id,
    user_id: user.id,
    stored_at: record.storedAt,
    file_names: record.fileNames,
    site: record.site,
    duration_minutes: record.durationMinutes,
    hands: record.hands,
  })
  if (error) throw error
}

export async function deleteCloudRecord(id: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) throw error
}

// ── GEM snapshot CRUD ─────────────────────────────────────────────────────────

export async function loadGemSnapshots(): Promise<GemSnapshot[]> {
  const { data, error } = await supabase
    .from('gem_snapshots')
    .select('*')
    .order('month', { ascending: false })
  if (error) throw error
  return (data ?? []).map(row => ({
    id: row.id,
    month: row.month,
    balance: row.balance,
    redeemed: row.redeemed,
    recordedAt: row.recorded_at,
  }))
}

export async function saveGemSnapshot(snapshot: Omit<GemSnapshot, 'id'>): Promise<void> {
  const { data, error: authError } = await supabase.auth.getUser()
  if (authError || !data.user) throw new Error('Not authenticated')
  const { error } = await supabase.from('gem_snapshots').upsert({
    user_id: data.user.id,
    month: snapshot.month,
    balance: snapshot.balance,
    redeemed: snapshot.redeemed,
    recorded_at: snapshot.recordedAt,
  }, { onConflict: 'user_id,month' })
  if (error) throw error
}

/** Returns 'YYYY-MM' for a given Date (defaults to today). */
export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Returns 'YYYY-MM' for the previous month. */
export function prevMonthKey(date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth() - 1, 1)
  return monthKey(d)
}

/**
 * Returns true if the monthly GEM check-in should be shown.
 * Triggers within the first 7 days of a new month when no snapshot
 * exists for the current month yet.
 */
export function shouldShowGemCheckIn(snapshots: GemSnapshot[]): boolean {
  const today = new Date()
  if (today.getDate() > 7) return false
  const current = monthKey(today)
  return !snapshots.some(s => s.month === current)
}

const STORAGE_KEY = 'plo-tracker-sessions'

// ── Serialisation helpers ─────────────────────────────────────────────────────

export function handToRaw(h: SessionHand): RawHand {
  return { ...h, timestamp: h.timestamp.getTime() }
}

export function rawToHand(r: RawHand): SessionHand {
  // Provide defaults for fields added after initial release so old stored
  // records remain compatible without a migration.
  return {
    ...r,
    timestamp: new Date(r.timestamp),
    jackpot:            r.jackpot            ?? 0,
    bingo:              r.bingo              ?? 0,
    fortune:            r.fortune            ?? 0,
    tax:                r.tax                ?? 0,
    totalDeductions:    r.totalDeductions    ?? r.rake ?? 0,
    heroTotalDeductions:r.heroTotalDeductions ?? r.heroRake ?? 0,
    reconciledDiff:     r.reconciledDiff     ?? 0,
    hadFlop:            r.hadFlop            ?? false,
    preflopRaiseCount:  r.preflopRaiseCount  ?? 0,
    expectedRake:       r.expectedRake       ?? 0,
    rakeVariance:       r.rakeVariance       ?? 0,
  }
}

// ── Site detection ────────────────────────────────────────────────────────────

/** Infer poker site from first hand ID prefix. */
export function detectSite(hands: SessionHand[]): string {
  const id = hands[0]?.handId ?? ''
  // GGPoker / Natural8 hand IDs start with letters like "OM", "RC", "HC" etc.
  if (/^[A-Z]{2}\d/.test(id)) return 'GGPoker'
  // PokerStars: numeric IDs
  if (/^\d/.test(id)) return 'PokerStars'
  return 'GGPoker'
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function loadRecords(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SessionRecord[]
  } catch {
    return []
  }
}

export function saveRecord(record: SessionRecord): void {
  const existing = loadRecords()
  // Avoid duplicates by id
  const filtered = existing.filter(r => r.id !== record.id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...filtered, record]))
}

export function deleteRecord(id: string): void {
  const existing = loadRecords().filter(r => r.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
}

export function clearRecords(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Compute actual play time in minutes by summing consecutive inter-hand gaps
 * under 2 hours. Gaps ≥ 2h are treated as breaks between separate playing
 * sessions and excluded. This correctly handles uploads containing files from
 * multiple playing days — overnight gaps are never counted as play time.
 */
function calcPlayMinutes(hands: SessionHand[]): number {
  if (hands.length < 2) return 0
  const ts = hands.map(h => h.timestamp.getTime()).sort((a, b) => a - b)
  const BREAK_MS = 2 * 60 * 60_000 // 2 hours
  let playMs = 0
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i] - ts[i - 1]
    if (gap < BREAK_MS) playMs += gap
  }
  return Math.round((playMs / 60_000) * 100) / 100
}

/** Create a new SessionRecord from parsed hands + file names. */
export function createRecord(hands: SessionHand[], fileNames: string[]): SessionRecord {
  const durationMinutes = calcPlayMinutes(hands)

  // Sanity check: > 12h of actual play time is extremely unlikely for a single
  // upload and almost certainly indicates a data or parsing error.
  if (durationMinutes > 12 * 60) {
    console.warn(
      `[stackrake] Session duration ${(durationMinutes / 60).toFixed(1)}h exceeds 12h — ` +
      `possible multi-session upload or timestamp error. Files: ${fileNames.join(', ')}`
    )
  }

  return {
    id: crypto.randomUUID(),
    storedAt: Date.now(),
    fileNames,
    site: detectSite(hands),
    durationMinutes,
    hands: hands.map(handToRaw),
  }
}
