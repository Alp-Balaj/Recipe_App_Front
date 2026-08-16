import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/auth/AuthContext'
import { ApiUnauthorizedError } from '@/api/client'
import AuthScreen, { SubmitButton } from '@/components/AuthScreen'
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
      await login(values)
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        setBanner('Invalid username or password.')
      } else {
        setBanner('Something went wrong. Please try again.')
      }
    }
  })

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
