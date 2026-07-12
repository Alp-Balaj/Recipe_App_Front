// ─────────────────────────────────────────────────────────────────────────
// Presentation helpers shared by the lane-A recipe surfaces (detail + browse).
//
// Real recipes carry structured data (integer minutes, per-step timerSeconds,
// a nullable imageUrl) rather than the mock's display strings, so the pages
// format them here in one place. New lane-A-only module — imported by
// RecipeDetailPage and BrowsePage; nothing else depends on it.
// ─────────────────────────────────────────────────────────────────────────

/**
 * A deterministic warm gradient for a recipe, keyed by its id/title. Used as
 * the header/banner fallback when imageUrl is null, keeping the original
 * gradient look for image-less recipes (plan Decision 6 / inherited note).
 */
export function gradientFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  // Stay in the app's warm amber→terracotta family (hue ~18–48°).
  const hue = 18 + (hash % 30)
  const light = `hsl(${hue + 8}, 72%, 62%)`
  const deep = `hsl(${hue}, 68%, 42%)`
  return `radial-gradient(circle at 50% 38%, ${light}, ${deep} 80%)`
}

/** Whole-minute duration → "25 min" / "1 h 5 min" / "1 h". */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

/** A step's timerSeconds → "45 s" / "5 min" / "1 min 30 s". */
export function formatTimer(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `${seconds} s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (s === 0) return `${m} min`
  return `${m} min ${s} s`
}

/** An ingredient's quantity + unit → "3 tbsp", "150 g", "2" (unitless). */
export function formatQuantity(quantity: number, unit: string): string {
  const q = String(quantity)
  const u = unit?.trim()
  return u ? `${q} ${u}` : q
}

/** Human label for a Visibility enum value. */
export function visibilityLabel(v: string): string {
  switch (v) {
    case 'Public':
      return 'Public'
    case 'Private':
      return 'Private'
    case 'FriendsOnly':
      return 'Friends only'
    default:
      return v
  }
}
