import { http, HttpResponse } from 'msw'
import type { AuthResponse, LoginRequest, RecipeListResponse, RegisterRequest } from '@/api/types'
import type { CommentListResponse, FeedListResponse, UserProfileResponse } from '@/api/social'

// Wildcard-prefixed paths so these match the real fetched URL regardless of
// origin or the /api proxy prefix (fetch('/api/auth/login') → ".../auth/login").

/** A stable AuthResponse fixture for a given username. */
export function makeAuthResponse(username: string): AuthResponse {
  return {
    token: `test.jwt.${username}`,
    expiresAtUtc: '2999-01-01T00:00:00Z',
    userId: '11111111-1111-1111-1111-111111111111',
    username,
  }
}

/** A UserProfileResponse fixture (social-feed cp06); override what you assert. */
export function makeUserProfile(over: Partial<UserProfileResponse> = {}): UserProfileResponse {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'testuser',
    bio: null,
    profileImageUrl: null,
    cookingRank: 0,
    createdAt: '2026-07-01T00:00:00Z',
    followerCount: 0,
    followingCount: 0,
    recipeCount: 0,
    followedByMe: false,
    ...over,
  }
}

// Test triggers: these specific inputs drive the failure branches.
export const TAKEN_USERNAME = 'takenuser'
export const WRONG_PASSWORD = 'wrongpassword'

export const handlers = [
  http.post('*/auth/register', async ({ request }) => {
    const body = (await request.json()) as RegisterRequest
    if (body.username === TAKEN_USERNAME) {
      return HttpResponse.json({ error: 'That username or email is already taken.' }, { status: 409 })
    }
    return HttpResponse.json(makeAuthResponse(body.username))
  }),

  http.post('*/auth/login', async ({ request }) => {
    const body = (await request.json()) as LoginRequest
    if (body.password === WRONG_PASSWORD) {
      return new HttpResponse(null, { status: 401 })
    }
    return HttpResponse.json(makeAuthResponse(body.usernameOrEmail))
  }),

  http.get('*/auth/me', ({ request }) => {
    if (!request.headers.get('Authorization')) {
      return new HttpResponse(null, { status: 401 })
    }
    return HttpResponse.json({
      userId: '11111111-1111-1111-1111-111111111111',
      username: 'booteduser',
    })
  }),

  // Default browse list: empty. Keeps any test that lands on /library (the
  // BrowsePage, checkpoint 04) from hitting the real network; browse-specific
  // tests override this with `server.use(...)`. Matches the exact `/recipes`
  // path only — the detail `/recipes/:id` handler is separate.
  http.get('*/recipes', () =>
    HttpResponse.json({ items: [], nextCursor: null } satisfies RecipeListResponse),
  ),

  // Default feed: empty discover. Keeps any test that lands on /feed (the
  // FeedPage, social-feed cp05) off the real network; feed-specific tests
  // override with `server.use(...)`.
  http.get('*/feed', () =>
    HttpResponse.json({ items: [], nextCursor: null, source: 'discover' } satisfies FeedListResponse),
  ),

  // ── social-feed cp06 defaults — same rationale as the /recipes + /feed
  // fallbacks above; cp06-specific tests override with `server.use(...)`. ──

  // The profile Saved tab (fetched whenever it's opened). Registered before
  // the `*/users/:id` matcher for clarity (`:id` is single-segment anyway).
  http.get('*/users/me/saved-recipes', () =>
    HttpResponse.json({ items: [], nextCursor: null } satisfies RecipeListResponse),
  ),

  // Public profile — ProfileTab now calls GET /users/{id} with the caller's
  // own id on every /profile render, so a default MUST exist.
  http.get('*/users/:id', () => HttpResponse.json(makeUserProfile())),

  // The /users/:id recipe grid.
  http.get('*/users/:id/recipes', () =>
    HttpResponse.json({ items: [], nextCursor: null } satisfies RecipeListResponse),
  ),

  // A recipe's comment list (detail page + comment sheet).
  http.get('*/recipes/:id/comments', () =>
    HttpResponse.json({ items: [], nextCursor: null } satisfies CommentListResponse),
  ),
]
