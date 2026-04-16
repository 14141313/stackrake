/**
 * Splits a raw GGPoker hand history file into individual hand strings.
 * Delimiter: lines starting with "Poker Hand #"
 */
export function splitHands(raw: string): string[] {
  const lines = raw.split('\n')
  const hands: string[] = []
  let current: string[] = []

  for (const line of lines) {
    if (line.startsWith('Poker Hand #')) {
      if (current.length > 0) {
        hands.push(current.join('\n').trim())
      }
      current = [line]
    } else {
      current.push(line)
    }
  }

  if (current.length > 0) {
    const trimmed = current.join('\n').trim()
    if (trimmed) hands.push(trimmed)
  }

  return hands
}
