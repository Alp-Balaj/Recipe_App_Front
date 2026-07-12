import { http, HttpResponse } from 'msw'
import type { AuthResponse, LoginRequest, RegisterRequest } from '@/api/types'

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
]
