import { useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/auth/AuthContext'
import { ApiConflictError } from '@/api/client'
import AuthScreen, { SubmitButton } from '@/components/AuthScreen'
import TextField from '@/components/ui/TextField'

// Mirrors RegisterRequestValidator: username 3–50, valid email, password min 8.
const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'At least 3 characters')
    .max(50, 'At most 50 characters'),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
})

type RegisterForm = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const { register: registerUser, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [banner, setBanner] = useState<string | null>(null)

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/discover'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  // stream K: a brand-new account always goes through the wizard first, so this
  // guard has to stand aside for the one render between `register` flipping the
  // status and the navigate below running. Without it that render redirects
  // straight to `from` and the wizard is never seen — a ref, not state, because
  // it must be readable during THAT render rather than scheduling another.
  const headingToWizard = useRef(false)

  if (status === 'authenticated' && !headingToWizard.current) return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null)
    try {
      // Register returns a full AuthResponse — one call signs the user in.
      headingToWizard.current = true
      await registerUser(values)
      // Straight to the wizard rather than to `from`, carrying the original
      // destination so finishing or skipping lands where the user was going.
      navigate('/welcome', { replace: true, state: { from } })
    } catch (err) {
      headingToWizard.current = false
      if (err instanceof ApiConflictError) {
        setBanner(err.message || 'That username or email is already taken.')
      } else {
        setBanner('Something went wrong. Please try again.')
      }
    }
  })

  return (
    <AuthScreen
      title="Create account"
      subtitle="Join to post recipes and get AI suggestions for what to cook."
      banner={banner}
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="Username"
          autoComplete="username"
          autoFocus
          error={errors.username?.message}
          {...register('username')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <SubmitButton disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </SubmitButton>
      </form>
    </AuthScreen>
  )
}
