// Image-URL resolution (social-feed cp05).
//
// The cp04 upload endpoint returns RELATIVE urls (`/images/<guid32>.<ext>`) —
// the backend serves them at its root, so in dev they must go through the
// /api proxy prefix like every other backend call (wire-contract addendum,
// Sessions/2026-07-18-social-feed-image-upload: "URLs are relative — the
// frontend prefixes its API base"). Absolute http(s) urls pass through.

/** Resolve a RecipeResponse.imageUrl into something the browser can fetch. */
export function resolveImageUrl(url: string): string {
  return url.startsWith('/') ? `/api${url}` : url
}
