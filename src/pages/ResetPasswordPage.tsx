import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LinkError, resetPassword } from '@/api/account'
import { ApiValidationError } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import AuthScreen, { authLink, authLinkButton, SubmitButton } from '@/components/AuthScreen'
import TextField from '@/components/ui/TextField'

// KAN-19. Reached from the emailed link, always signed out, so it reads the token off
// the query string rather than from any session.

// Mirrors PasswordRules on the backend: min 8, at least one letter and one digit.
//
// The confirmation field is client-side only — the API takes one password — and it is here
// because of what makes THIS form different from registration. The link is single-use, so a
// typo is not "sign in again and try": it spends the one link the user has and locks them
// out with a password they do not know, and the way back is another email. Catching that in
// the browser costs one field.
const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one digit'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Both passwords must match',
  })

type ResetForm = z.infer<typeof resetSchema>

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { adoptSession } = useAuth()

  const [banner, setBanner] = useState<string | null>(null)
  const [deadLink, setDeadLink] = useState<'expired' | 'invalid' | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null)
    try {
      const session = await resetPassword(token, values.password)
      // Signed in on this device with the session the reset returned — every OTHER
      // device was signed out by the same call, which is the point of the flow.
      adoptSession(session)
      navigate('/discover', { replace: true })
    } catch (err) {
      if (err instanceof LinkError) {
        setDeadLink(err.failure)
      } else if (err instanceof ApiValidationError) {
        // The server's password rules are the authority; the schema above only
        // mirrors them, so a disagreement is shown rather than swallowed.
        setBanner(Object.values(err.errors).flat()[0] ?? 'That password was rejected.')
      } else {
        setBanner('Something went wrong. Please try again.')
      }
    }
  })

  const askAgain = (
    <>
      <Link to="/forgot-password" style={authLink}>
        Request a new link
      </Link>
      {' · '}
      <Link to="/login" style={authLink}>
        Sign in
      </Link>
    </>
  )

  // A link with no token at all is the same dead end as an unusable one, and gets the
  // same screen rather than a form that cannot possibly submit.
  const dead = deadLink ?? (token ? null : 'invalid')

  if (dead) {
    return (
      <AuthScreen
        title={dead === 'expired' ? 'That link has expired' : 'That link is not usable'}
        subtitle={
          dead === 'expired'
            ? 'Reset links last an hour. Ask for a new one and it will work straight away.'
            : 'It may have been used already, or replaced by a newer link. Ask for a fresh one to continue.'
        }
        footer={askAgain}
      >
        <Link to="/forgot-password" style={authLinkButton}>
          Send a new link
        </Link>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      title="Choose a new password"
      subtitle="Setting a new password signs out every other device on this account."
      banner={banner}
      footer={askAgain}
    >
      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <SubmitButton disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save new password'}
        </SubmitButton>
      </form>
    </AuthScreen>
  )
}


