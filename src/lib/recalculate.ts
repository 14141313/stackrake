/**
 * recalculate.ts
 *
 * ARCHITECTURAL PRINCIPLE — NON-NEGOTIABLE:
 * The raw hand data (RawHand[]) stored in the database is the immutable source
 * of truth. It is written once at upload and never modified. All derived metrics
 * — session duration, $/hour, BB/100, rake paid, rakeback — are computed from
 * that raw data and can be recomputed at any time without any user action.
 *
 * NEVER require a user to delete and re-upload sessions to fix a calculation
 * error. The correct fix is always:
 *   1. Fix the calculation logic here.
 *   2. Call recalculateAll() for affected users.
 *   3. Users see corrected data immediately with zero action on their part.
 *
 * The recalculate functions accept a `save` callback (rather than importing
 * saveCloudRecord directly) to keep this module free of circular dependencies
 * and fully unit-testable.
 */

import type { SessionRecord } from './types'

/**
 * Compute actual play time in minutes from stored hand timestamps.
 *
 * Method: sort timestamps, then sum only consecutive gaps that are under 2
 * hours. Gaps >= 2h are treated as breaks between separate playing sessions
 * and excluded. This correctly handles uploads that contain files from
 * multiple playing days — overnight gaps are never counted as table time.
 *
 * Accepts hands with timestamp as a number (ms since epoch) so it works with
 * RawHand[] directly. For SessionHand[] (timestamp: Date) convert first:
 *   calcDurationMinutes(hands.map(h => ({ timestamp: h.timestamp.getTime() })))
 */
export function calcDurationMinutes(hands: { timestamp: number }[]): number {
  if (hands.length < 2) return 0
  const ts = hands.map(h => h.timestamp).sort((a, b) => a - b)
  const BREAK_MS = 2 * 60 * 60_000 // 2 hours — anything larger is a session break
  let playMs = 0
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i] - ts[i - 1]
    if (gap < BREAK_MS) playMs += gap
  }
  return Math.round((playMs / 60_000) * 100) / 100
}

/**
 * Recompute all derived stored metrics for a single record from its raw hands,
 * persist the updated record via the provided save function, and return it.
 */
export async function recalculateRecord(
  record: SessionRecord,
  save: (r: SessionRecord) => Promise<void>
): Promise<SessionRecord> {
  const updated: SessionRecord = {
    ...record,
    durationMinutes: calcDurationMinutes(record.hands),
  }
  await save(updated)
  return updated
}

/**
 * Recompute derived metrics for every record in the array, persist all
 * changes, and return the updated array.
 *
 * Safe to call multiple times — idempotent for records whose values are
 * already correct.
 */
export async function recalculateAll(
  records: SessionRecord[],
  save: (r: SessionRecord) => Promise<void>
): Promise<SessionRecord[]> {
  return Promise.all(records.map(r => recalculateRecord(r, save)))
}
