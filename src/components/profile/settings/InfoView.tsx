// ─────────────────────────────────────────────────────────────────────────
// The Support rows (design 3e): Help center and Terms & privacy. Static
// informational content — no backend — rendered as titled sections inside the
// standard settings frame so the rows lead somewhere real instead of nowhere.
// ─────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import { cardShell, SettingsScreen } from './settingsUi'

interface Section {
  heading: string
  body: ReactNode
}

function InfoScreen({ title, sections, onBack }: { title: string; sections: Section[]; onBack: () => void }) {
  return (
    <SettingsScreen title={title} onBack={onBack}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sections.map((s) => (
          <div key={s.heading} style={{ ...cardShell, padding: '15px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>{s.heading}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>{s.body}</div>
          </div>
        ))}
      </div>
    </SettingsScreen>
  )
}

export function HelpView({ onBack }: { onBack: () => void }) {
  return (
    <InfoScreen
      title="Help center"
      onBack={onBack}
      sections={[
        {
          heading: 'Getting started',
          body: 'Tap ＋ New recipe to publish your first dish. Add ingredients and steps, pick a cover photo, and choose who can see it.',
        },
        {
          heading: 'Cooking rank & badges',
          body: 'Publishing recipes and growing your following raises your cooking rank and unlocks badges on your profile.',
        },
        {
          heading: 'Feed & following',
          body: 'Follow other cooks to fill your feed with their latest recipes. Save any recipe to find it again under your Saved tab.',
        },
        {
          heading: 'Still stuck?',
          body: 'Reach the team at support@whatarewecooking.app and we’ll get back to you.',
        },
      ]}
    />
  )
}

export function TermsView({ onBack }: { onBack: () => void }) {
  return (
    <InfoScreen
      title="Terms & privacy"
      onBack={onBack}
      sections={[
        {
          heading: 'Your content',
          body: 'Recipes, photos, and comments you post stay yours. You grant us permission to display them in the app to the audience you choose per recipe.',
        },
        {
          heading: 'Your data',
          body: 'We store your account details and the content you create to run the app. We don’t sell your personal data.',
        },
        {
          heading: 'Acceptable use',
          body: 'Be kind, post recipes you have the right to share, and don’t abuse other cooks. Accounts that break these rules may be removed.',
        },
        {
          heading: 'Contact',
          body: 'Questions about these terms? Email privacy@whatarewecooking.app.',
        },
      ]}
    />
  )
}
