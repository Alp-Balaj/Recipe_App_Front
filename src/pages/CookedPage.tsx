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
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CookedDishList from '@/components/cooked/CookedDishList'

export default function CookedPage() {
  const navigate = useNavigate()

  return (
    <div className="scroll" style={page}>
      <div style={canvas}>
        <header style={{ marginBottom: 18 }}>
          <Link to="/plan" style={back}>
            ‹ Plan
          </Link>
          <h1 style={title}>Cooked</h1>
          <div style={subtitle}>
            Everything you have made, most recently cooked first. Ratings and notes are yours alone.
          </div>
        </header>

        <CookedDishList onBrowse={() => navigate('/discover')} />
      </div>
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
