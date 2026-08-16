import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { requestPasswordReset } from '@/api/account'
import AuthScreen, { authLink, authMuted, SubmitButton } from '@/components/AuthScreen'
import TextField from '@/components/ui/TextField'

// KAN-19. Reuses the auth chrome and its submit button rather than introducing new
// layout — a recovery screen that looks unlike the rest of the sign-in surface is the
// exact thing users are told to be suspicious of.

const forgotSchema = z.object({
  email: z.email('Enter a valid email'),
})

type ForgotForm = z.infer<typeof forgotSchema>

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({ resolver: zodResolver(forgotSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null)
    try {
      await requestPasswordReset(values.email)
      setSent(true)
    } catch {
      // Only a genuine failure to REACH the server lands here. The server answers
      // identically for an address it knows and one it does not, so there is no
      // branch below that could reveal which this was.
      setBanner('Something went wrong. Please try again.')
    }
  })

  const backToSignIn = (
    <>
      Remembered it?{' '}
      <Link to="/login" style={authLink}>
        Sign in
      </Link>
    </>
  )

  // The confirmation is deliberately phrased so it says nothing about whether the
  // address has an account. "We've sent you a link" would be a lie half the time and
  // an account-enumeration oracle the other half.
  if (sent) {
    return (
      <AuthScreen
        title="Check your inbox"
        subtitle={`If an account exists for ${getValues('email')}, a reset link is on its way. It expires in an hour.`}
        footer={backToSignIn}
      >
        <div style={authMuted}>
          Nothing arrived after a few minutes? Check your spam folder, then{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            style={{ ...authLink, background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
          >
            try another address
          </button>
          .
        </div>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      title="Forgot your password?"
      subtitle="Enter the email address on your account and we'll send you a link to choose a new password."
      banner={banner}
      footer={backToSignIn}
    >
      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />
        <SubmitButton disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </SubmitButton>
      </form>
    </AuthScreen>
  )
}

