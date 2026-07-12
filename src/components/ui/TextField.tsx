import { forwardRef, type InputHTMLAttributes } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

const ERROR_COLOR = '#d9534f'

/**
 * Labelled text input in the app's inline-style idiom. Spread a
 * react-hook-form `register('field')` onto it — the callback ref forwards.
 */
const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name
  return (
    <label htmlFor={inputId} style={{ display: 'block', marginBottom: 14 }}>
      <span
        style={{
          display: 'block',
          fontSize: 12.5,
          fontWeight: 700,
          color: 'var(--muted)',
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      <input
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        style={{
          width: '100%',
          padding: '11px 12px',
          borderRadius: 12,
          border: `1px solid ${error ? ERROR_COLOR : 'var(--border)'}`,
          background: 'var(--inputbg)',
          color: 'var(--text)',
          fontSize: 14,
          fontFamily: 'inherit',
          outline: 'none',
        }}
        {...rest}
      />
      {error && (
        <span role="alert" style={{ display: 'block', fontSize: 12, color: ERROR_COLOR, marginTop: 5 }}>
          {error}
        </span>
      )}
    </label>
  )
})

export default TextField
