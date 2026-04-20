/**
 * Ocean Rewards tier definitions.
 * Single source of truth — used by onboarding, dashboard, rakeback panel,
 * and settings modal.
 */

export const OCEAN_TIERS = [
  { name: 'Fish',     pct: 0.16, multiplier: 1.5 },
  { name: 'Shrimp',  pct: 0.25, multiplier: 2.0 },
  { name: 'Crab',    pct: 0.30, multiplier: 2.5 },
  { name: 'Turtle',  pct: 0.40, multiplier: 3.0 },
  { name: 'Octopus', pct: 0.50, multiplier: 3.5 },
  { name: 'Dolphin', pct: 0.60, multiplier: 4.0 },
  { name: 'Whale',   pct: 0.70, multiplier: 4.5 },
  { name: 'Shark',   pct: 0.80, multiplier: 5.0 },
] as const

export type TierName = typeof OCEAN_TIERS[number]['name']

export const DEFAULT_TIER: TierName = 'Turtle'

export function getTierConfig(name: TierName) {
  return OCEAN_TIERS.find(t => t.name === name) ?? OCEAN_TIERS[3]
}
