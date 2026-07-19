import { useState } from 'react'
import { Outlet } from 'react-router-dom'

export type Mode = 'light' | 'dark'

/** Shape of the outlet context every routed page can read via useOutletContext. */
export interface ThemeContextValue {
  mode: Mode
  setMode: (mode: Mode) => void
  toggleMode: () => void
}

/**
 * Root layout route: owns the theme mode and stamps data-mode on the shell so
 * the CSS variables apply to every page — including /login and /register,
 * which render outside the tabbed AppShell.
 */
export default function ThemeRoot() {
  // The imported redesign is dark-native; dark is the default open state.
  // The toggle (Profile · Appearance, and the sidebar moon) flips to the warm
  // light variant and back.
  const [mode, setMode] = useState<Mode>('dark')
  const toggleMode = () => setMode((m) => (m === 'light' ? 'dark' : 'light'))

  const context: ThemeContextValue = { mode, setMode, toggleMode }

  return (
    <div className="app-shell" data-mode={mode}>
      <Outlet context={context} />
    </div>
  )
}
