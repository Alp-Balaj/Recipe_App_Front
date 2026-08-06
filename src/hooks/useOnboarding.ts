// ─────────────────────────────────────────────────────────────────────────
// POST /users/me/onboarding — the post-register wizard's one write (stream K).
//
// On success it seeds the caller's own profile cache with the fresh server
// copy, the same courtesy useUpdateProfile does, so account settings opened
// straight after the wizard already shows what was chosen.
//
// It also invalidates the /auth/me key: `needsOnboarding` is read from there,
// and a stale `true` sitting in the cache is what would send a user who just
// finished the wizard back into it.
// ─────────────────────────────────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import {
  completeOnboarding,
  type CompleteOnboardingRequest,
  type UserProfileResponse,
} from '@/api/social'

export function useCompleteOnboarding() {
  const queryClient = useQueryClient()

  return useMutation<UserProfileResponse, Error, CompleteOnboardingRequest>({
    mutationFn: (body) => completeOnboarding(body),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.users.profile(profile.id), profile)
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() })
    },
  })
}
