import { useState, type CSSProperties } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/auth/AuthContext'
import { ApiError, ApiUnauthorizedError } from '@/api/client'
import type { SecondFactorChallenge } from '@/api/secondFactor'
import AuthScreen, { SubmitButton } from '@/components/AuthScreen'
import SecondFactorChallengeForm from '@/components/auth/SecondFactorChallengeForm'
import TextField from '@/components/ui/TextField'

// LoginRequest is a single usernameOrEmail field — the backend matches either.
const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, 'Enter your username or email'),
  password: z.string().min(1, 'Enter your password'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [banner, setBanner] = useState<string | null>(null)
  // KAN-21: the sign-in's second half. Held in component state and nowhere else —
  // it is not a credential (it opens nothing without a code), and it must not
  // outlive this screen: a challenge left in storage is a password success
  // somebody could finish tomorrow.
  const [challenge, setChallenge] = useState<SecondFactorChallenge | null>(null)

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/discover'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  // Already signed in (e.g. navigated here manually) → bounce to the app.
  if (status === 'authenticated') return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null)
    try {
      // KAN-21: for an enrolled account this resolves with a CHALLENGE and no
      // session — the password bought the right to be asked for a code. Only the
      // null case means signed in.
      const raised = await login(values)
      if (raised) {
        setChallenge(raised)
        return
      }
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        setBanner('Invalid username or password.')
      } else if (err instanceof ApiError && err.status === 429) {
        // ADR-0008's escalating delay, not a lockout — so the message says what
        // to do (wait a moment) rather than implying the account is gone.
        setBanner('Too many attempts. Please wait a moment and try again.')
      } else {
        setBanner('Something went wrong. Please try again.')
      }
    }
  })

  if (challenge) {
    return (
      <AuthScreen
        title="One more step"
        subtitle="Your account is protected by an authenticator app."
        banner={banner}
        footer={
          <button type="button" onClick={() => setChallenge(null)} style={backButton}>
            Use a different account
          </button>
        }
      >
        <SecondFactorChallengeForm
          challenge={challenge}
          onAnswered={() => navigate(from, { replace: true })}
          onExpired={() => {
            // Five wrong codes, or it aged out. There is nothing left to type
            // into, so the screen goes back to the password rather than leaving
            // a dead field on display.
            setChallenge(null)
            setBanner('That sign-in timed out. Please enter your password again.')
          }}
        />
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to browse recipes and chat about what to cook."
      banner={banner}
      footer={
        <>
          New here?{' '}
          <Link to="/register" style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="Username or email"
          autoComplete="username"
          autoFocus
          error={errors.usernameOrEmail?.message}
          {...register('usernameOrEmail')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <SubmitButton disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </SubmitButton>
        {/* KAN-19: recovery has to be discoverable at the moment it is needed, which is
            here, on the screen where the password just failed — not buried in settings
            the user cannot reach. */}
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Link
            to="/forgot-password"
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}
          >
            Forgot your password?
          </Link>
        </div>
      </form>
    </AuthScreen>
  )
}

const backButton: CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 'inherit',
  fontWeight: 700,
  color: 'var(--accent)',
  cursor: 'pointer',
}
