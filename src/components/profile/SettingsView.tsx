// ─────────────────────────────────────────────────────────────────────────
// Settings (design 3e) — the gear screen reached from the profile. The menu:
// Appearance (the real light/dark toggle), an Account section (Edit profile —
// backed by PUT /users/me — plus Notifications and Privacy), a Support section
// (Help center, Terms & privacy), and Log out. Each row navigates to a real
// sub-screen; this component owns that sub-navigation so ProfileTab only sees
// "settings open / closed".
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import type { UserProfileResponse } from '@/api/social'
import type { Mode } from '@/components/ThemeRoot'
import EditProfileView from './settings/EditProfileView'
import { HelpView, TermsView } from './settings/InfoView'
import { NotificationsView, PrivacyView } from './settings/PrefsView'
import { NavRow, RowGroup, SectionLabel, SettingsScreen } from './settings/settingsUi'

type SubView = 'menu' | 'edit-profile' | 'notifications' | 'privacy' | 'help' | 'terms'

interface Props {
  mode: Mode
  onSetMode: (mode: Mode) => void
  onLogout: () => void
  onBack: () => void
  /** The caller's own profile (GET /users/{me}) — seeds Edit profile. */
  profile?: UserProfileResponse
}

export default function SettingsView({ mode, onSetMode, onLogout, onBack, profile }: Props) {
  const [sub, setSub] = useState<SubView>('menu')
  const toMenu = () => setSub('menu')

  if (sub === 'edit-profile') {
    return profile ? (
      <EditProfileView profile={profile} onBack={toMenu} />
    ) : (
      <SettingsScreen title="Edit profile" onBack={toMenu}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading your profile…</div>
      </SettingsScreen>
    )
  }
  if (sub === 'notifications') return <NotificationsView onBack={toMenu} />
  if (sub === 'privacy') return <PrivacyView onBack={toMenu} />
  if (sub === 'help') return <HelpView onBack={toMenu} />
  if (sub === 'terms') return <TermsView onBack={toMenu} />

  return (
    <SettingsScreen title="Settings" onBack={onBack}>
      {/* Appearance */}
      <SectionLabel>Appearance</SectionLabel>
      <div style={{ ...cardShell, padding: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['light', 'dark'] as Mode[]).map((m) => {
            const active = mode === m
            return (
              <button
                key={m}
                onClick={() => onSetMode(m)}
                aria-pressed={active}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  cursor: 'pointer',
                  padding: 12,
                  borderRadius: 15,
                  fontSize: 14,
                  fontWeight: active ? 800 : 600,
                  border: 'none',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s, color 0.2s',
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--accent-ink)' : 'var(--muted)',
                }}
              >
                {m === 'light' ? '☀ Light' : '☾ Dark'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Account */}
      <SectionLabel style={{ marginTop: 22 }}>Account</SectionLabel>
      <RowGroup>
        <NavRow icon="◍" label="Edit profile" onClick={() => setSub('edit-profile')} />
        <NavRow icon="◔" label="Notifications" onClick={() => setSub('notifications')} />
        <NavRow icon="⚿" label="Privacy & visibility" onClick={() => setSub('privacy')} last />
      </RowGroup>

      {/* Support */}
      <SectionLabel style={{ marginTop: 22 }}>Support</SectionLabel>
      <RowGroup>
        <NavRow icon="?" label="Help center" onClick={() => setSub('help')} />
        <NavRow icon="§" label="Terms & privacy" onClick={() => setSub('terms')} last />
      </RowGroup>

      <button onClick={onLogout} style={logoutBtn}>
        Log out
      </button>

      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 16 }}>
        What are we cooking? · v2.0
      </div>
    </SettingsScreen>
  )
}

const cardShell: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
}

const logoutBtn: CSSProperties = {
  width: '100%',
  textAlign: 'center',
  cursor: 'pointer',
  background: 'transparent',
  border: '1px solid rgba(217, 83, 79, 0.5)',
  borderRadius: 14,
  padding: 13,
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'inherit',
  color: '#d9534f',
  marginTop: 24,
}
