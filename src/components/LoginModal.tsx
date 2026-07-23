// ─────────────────────────────────────────────────────────────────────────
// The login modal (guest-access plan §4.3, decision D6): the dismissible
// prompt every gated interaction opens for a guest. Frosted-glass treatment:
// the page behind stays visible through a blurred, theme-tinted backdrop
// (Modal's additive `frosted` prop) and the card itself is deliberately
// small — title, the two fields, submit, one footer line. On success it just
// closes (D4 — no auto-resume); "Create an account" routes out to /register.
// Dismissal: the ✕, a backdrop click, or Escape.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/auth/AuthContext'
import { useAuthGate } from '@/auth/AuthGateContext'
import { ApiUnauthorizedError } from '@/api/client'
import { SubmitButton } from '@/components/AuthScreen'
import Modal from '@/components/ui/Modal'
import TextField from '@/components/ui/TextField'

// Same shape as LoginPage: one usernameOrEmail field — the backend matches either.
const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, 'Enter your username or email'),
  password: z.string().min(1, 'Enter your password'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginModal() {
  const { login } = useAuth()
  const { closePrompt } = useAuthGate()
  const [banner, setBanner] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null)
    try {
      await login(values)
      // D4: success just closes the prompt — the guest's pending action is not replayed.
      closePrompt()
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        setBanner('Invalid username or password.')
      } else {
        setBanner('Something went wrong. Please try again.')
      }
    }
  })

  return (
    <Modal onClose={closePrompt} label="Sign in" variant="center" frosted>
      <div
        style={{
          maxWidth: 330,
          margin: '0 auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 60px -28px rgba(0, 0, 0, 0.45)',
          borderRadius: 22,
          padding: '20px 20px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>
            Sign in
          </h2>
          <button
            onClick={closePrompt}
            aria-label="Close sign-in"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: 'none',
              background: 'var(--surface2)',
              color: 'var(--text)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ✕
          </button>
        </div>

        {banner && (
          <div
            role="alert"
            style={{
              fontSize: 13,
              color: '#d9534f',
              background: 'rgba(217, 83, 79, 0.10)',
              border: '1px solid rgba(217, 83, 79, 0.35)',
              borderRadius: 12,
              padding: '9px 12px',
              marginBottom: 12,
            }}
          >
            {banner}
          </div>
        )}

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
        </form>

        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 14, textAlign: 'center' }}>
          New here?{' '}
          <Link
            to="/register"
            onClick={closePrompt}
            style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}
          >
            Create an account
          </Link>
        </div>
      </div>
    </Modal>
  )
}
