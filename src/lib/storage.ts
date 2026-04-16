import type { SessionRecord, SessionHand, RawHand } from './types'
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
    hands: row.hands as RawHand[],
  }))
}

export async function saveCloudRecord(record: SessionRecord): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase.from('sessions').upsert({
    id: record.id,
    user_id: user.id,
    stored_at: record.storedAt,
    file_names: record.fileNames,
    site: record.site,
    hands: record.hands,
  })
  if (error) throw error
}

export async function deleteCloudRecord(id: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) throw error
}

const STORAGE_KEY = 'plo-tracker-sessions'

// ── Serialisation helpers ─────────────────────────────────────────────────────

export function handToRaw(h: SessionHand): RawHand {
  return { ...h, timestamp: h.timestamp.getTime() }
}

export function rawToHand(r: RawHand): SessionHand {
  return { ...r, timestamp: new Date(r.timestamp) }
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

/** Create a new SessionRecord from parsed hands + file names. */
export function createRecord(hands: SessionHand[], fileNames: string[]): SessionRecord {
  return {
    id: crypto.randomUUID(),
    storedAt: Date.now(),
    fileNames,
    site: detectSite(hands),
    hands: hands.map(handToRaw),
  }
}
