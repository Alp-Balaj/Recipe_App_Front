// ─────────────────────────────────────────────────────────────────────────
// The Notifications and Privacy & visibility screens (design 3e Account rows).
// Neither has a backend surface yet, so each is a list of honest device-local
// toggles (persisted via useLocalPref) rather than switches that pretend to sync.
// A short note makes the "on this device" scope explicit.
// ─────────────────────────────────────────────────────────────────────────

import { useLocalPref } from '@/hooks/useLocalPref'
import { RowGroup, SettingsScreen, ToggleRow } from './settingsUi'

interface Pref {
  key: string
  label: string
  hint?: string
  fallback: boolean
}

function PrefList({
  title,
  note,
  prefs,
  onBack,
}: {
  title: string
  note: string
  prefs: Pref[]
  onBack: () => void
}) {
  return (
    <SettingsScreen title={title} onBack={onBack}>
      <RowGroup>
        {prefs.map((p, i) => (
          <PrefToggle key={p.key} pref={p} last={i === prefs.length - 1} />
        ))}
      </RowGroup>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '12px 4px 0', lineHeight: 1.5 }}>{note}</div>
    </SettingsScreen>
  )
}

function PrefToggle({ pref, last }: { pref: Pref; last: boolean }) {
  const [on, setOn] = useLocalPref(pref.key, pref.fallback)
  return <ToggleRow label={pref.label} hint={pref.hint} checked={on} onChange={setOn} last={last} />
}

const NOTIFICATION_PREFS: Pref[] = [
  { key: 'notif.push', label: 'Push notifications', hint: 'Alerts on this device', fallback: true },
  { key: 'notif.follows', label: 'New followers', fallback: true },
  { key: 'notif.comments', label: 'Comments on my recipes', fallback: true },
  { key: 'notif.likes', label: 'Likes on my recipes', fallback: false },
  { key: 'notif.digest', label: 'Weekly digest', hint: 'A roundup of recipes to try', fallback: false },
]

const PRIVACY_PREFS: Pref[] = [
  { key: 'privacy.discoverable', label: 'Show my profile in discover', fallback: true },
  { key: 'privacy.showSaved', label: 'Show my saved recipes', hint: 'Visible on your public profile', fallback: true },
  { key: 'privacy.showActivity', label: 'Show my activity', fallback: true },
]

export function NotificationsView({ onBack }: { onBack: () => void }) {
  return (
    <PrefList
      title="Notifications"
      note="These preferences are saved on this device. Delivery still depends on your OS and browser permissions."
      prefs={NOTIFICATION_PREFS}
      onBack={onBack}
    />
  )
}

export function PrivacyView({ onBack }: { onBack: () => void }) {
  return (
    <PrefList
      title="Privacy & visibility"
      note="Saved on this device. To set who can see a recipe, use its visibility — the default lives under Edit profile."
      prefs={PRIVACY_PREFS}
      onBack={onBack}
    />
  )
}
