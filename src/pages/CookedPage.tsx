// ─────────────────────────────────────────────────────────────────────────
// /cooked — the dishes you have actually made (KAN-4, design D2).
//
// Its unit is the DISH, not the cook: a recipe cooked four times is one row.
// That is the whole difference from /plan/cooks, which is the same cooking in
// time order and stays. This page answers "which of these turned out well, and
// what did I say about it last time"; that one answers "what did I cook on
// Friday".
//
// Private, always — Cooked is the user's own record and has no viewer-facing
// variant. /cooked is therefore in requiresAuth(), so a guest deep-linking it
// gets the login modal rather than the "couldn't load" state /plan/cooks shows.
//
// The list, its states and its "Show older dishes" control live in
// CookedDishList, which the Profile tab renders too.
//
// "Add a cook" (KAN-6) lives HERE and not in CookedDishList, even though the
// Profile tab renders that list too. Cooked is the page you open to look after
// your record; the Profile tab is a summary of it. Putting a write control on
// both would be two entry points to maintain for one gesture, and the summary is
// not where anyone goes to do bookkeeping.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AddCookPanel from '@/components/cooked/AddCookPanel'
import CookedDishList from '@/components/cooked/CookedDishList'

export default function CookedPage() {
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<string | null>(null)

  return (
    <div className="scroll" style={page}>
      <div style={canvas}>
        <header style={{ marginBottom: 18 }}>
          <Link to="/plan" style={back}>
            ‹ Plan
          </Link>
          <div style={titleRow}>
            <h1 style={title}>Cooked</h1>
            <button type="button" style={addButton} onClick={() => setAdding(true)}>
              Add a cook
            </button>
          </div>
          <div style={subtitle}>
            Everything you have made, most recently cooked first. Ratings and notes are yours alone.
          </div>
        </header>

        {/* A backdated cook usually lands somewhere down the list rather than at
            the top — that is the feature working, and it is also why it needs
            saying out loud. Without this the user records a two-year-old cook,
            sees an unchanged first screen, and concludes nothing happened. */}
        {added && (
          <div role="status" style={confirmation}>
            Added a cook of <strong>{added}</strong>.
          </div>
        )}

        <CookedDishList onBrowse={() => navigate('/discover')} />
      </div>

      {adding && (
        <AddCookPanel
          onClose={() => setAdding(false)}
          onAdded={(dishTitle) => setAdded(dishTitle)}
        />
      )}
    </div>
  )
}

const page: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '54px 18px 24px',
}

const canvas: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
}

const back: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
  textDecoration: 'none',
}

const titleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const addButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '7px 14px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  background: 'var(--surface)',
  color: 'var(--accent)',
}

const confirmation: CSSProperties = {
  marginBottom: 14,
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  padding: '10px 12px',
  fontSize: 13,
  color: 'var(--text)',
}

const title: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: '-0.015em',
  margin: '6px 0 0',
}

const subtitle: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  marginTop: 6,
}
