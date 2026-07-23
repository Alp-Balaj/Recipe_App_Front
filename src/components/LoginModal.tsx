// ─────────────────────────────────────────────────────────────────────────
// The login modal (guest-access plan §4.3, decision D6): the dismissible
// prompt every gated interaction opens for a guest. Built on the shared
// ui/Modal primitive; embeds the same login form shape as LoginPage. On
// success it just closes (D4 — no auto-resume of the pending action); the
// "Create an account" link routes out to the existing /register page.
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
    <Modal onClose={closePrompt} label="Sign in" variant="center">
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--cardsh)',
          borderRadius: 22,
          padding: '26px 22px',
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>
          Sign in to continue
        </h2>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0 18px' }}>
          You can browse as a guest — signing in lets you like, save, comment, follow and cook
          with the chat.
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
              padding: '10px 12px',
              marginBottom: 16,
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

        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 18, textAlign: 'center' }}>
          New here?{' '}
          <Link
            to="/register"
            onClick={closePrompt}
            style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}
          >
            Create an account
          </Link>
        </div>

        <button
          onClick={closePrompt}
          style={{
            width: '100%',
            marginTop: 10,
            padding: '10px 14px',
            borderRadius: 13,
            border: 'none',
            background: 'transparent',
            color: 'var(--muted)',
            fontSize: 13.5,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Keep browsing
        </button>
      </div>
    </Modal>
  )
}
