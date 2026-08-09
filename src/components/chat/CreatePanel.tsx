// ─────────────────────────────────────────────────────────────────────────
// The Create surface — "write me a new one" as a MODE, not a card.
//
// Everything in the Library tab is GROUNDED: the assistant may only point at
// recipes that already exist, and hallucinated ids are dropped. This tab is
// FREE: the model invents. That contrast is the feature's whole argument, and
// the old design made it with a card at the foot of the thread — one surface,
// two engines, two text fields, and no way to tell from the composer which one
// you were about to talk to.
//
// So the two engines are now two surfaces, and this one states what it is
// before it spends anything. Per D1 the generated recipe is a real, user-owned,
// flagged row the moment it is written, so the outcome is still a link to an
// ordinary /recipes/{id} — no bespoke review surface, no second write path.
// What the recipe does NOT get is rank: generating is worth zero points until
// somebody cooks it and rates it.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import DietaryConflictBadge from '@/components/recipes/DietaryConflictBadge'
import type { CreateRecipeState } from './useCreateRecipe'
import { ClockIcon, PlusGlyph, SearchIcon, SparkIcon, ThreadContextIcon } from './chatIcons'

export default function CreatePanel({
  state,
  conversationTitle,
  onSearchInstead,
}: {
  state: CreateRecipeState
  /** The thread whose recent messages ride along as context, when there is one. */
  conversationTitle?: string
  /** Hands the user back to the grounded tab — the free answer to a spent budget. */
  onSearchInstead: () => void
}) {
  // The budget is spent: this is not a failure, it is a "later", and the two
  // useful things to say are both about what the user CAN still do.
  if (state.isQuotaSpent) {
    return (
      <div>
        <div style={{ ...emptyWrap, paddingTop: 34 }}>
          <ClockIcon size={30} style={{ margin: '0 auto 14px', color: 'var(--muted)' }} />
          <h2 style={emptyTitle}>Out of AI calls today</h2>
          <p style={emptyLine}>Your allowance resets at midnight UTC. Nothing was saved.</p>
        </div>
        <div style={{ marginTop: 22 }}>
          <button type="button" onClick={onSearchInstead} style={{ ...fallbackButton, ...fallbackPrimary }}>
            <SearchIcon size={15} />
            Search my library instead
          </button>
          {/* The "+" the bottom nav no longer shows on this page, returned as a
              labelled button at the one moment manual entry IS the answer. */}
          <Link to="/recipes/new" style={{ ...fallbackButton, textDecoration: 'none' }}>
            <PlusGlyph size={15} />
            Write one myself
          </Link>
        </div>
      </div>
    )
  }

  const idle = !state.prompt && !state.result && !state.isPending && !state.isError

  return (
    <div>
      {conversationTitle && (
        <div style={contextChip}>
          <ThreadContextIcon size={13} />
          <span>Using context from “{conversationTitle}”</span>
        </div>
      )}

      {idle && (
        <div style={emptyWrap}>
          <SparkIcon size={34} style={{ margin: '0 auto 14px', color: 'var(--olive)' }} />
          <h2 style={emptyTitle}>This invents a recipe</h2>
          <p style={emptyLine}>It writes something new and saves it straight to your collection.</p>
          <p style={emptyLine}>It won't search what you already have — that's Library.</p>
        </div>
      )}

      {state.prompt && <div style={promptBubble}>{state.prompt}</div>}

      {state.isPending && (
        <div style={writingBubble} role="status">
          <SparkIcon size={15} />
          <span>Writing your recipe…</span>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ ...writingDot, animationDelay: `${i * 0.18}s` }} />
          ))}
        </div>
      )}

      {state.isError && !state.isQuotaSpent && (
        <span role="status" style={errorText}>
          The assistant couldn't write a usable recipe just now. Nothing was saved — try again.
        </span>
      )}

      {state.result && (
        <>
          <div style={resultCard}>
            <span style={resultEyebrow}>
              <SparkIcon size={10} />
              New · saved to your recipes
            </span>
            <span style={resultTitle}>{state.result.recipe.title}</span>
            <span style={resultMeta}>
              {state.result.recipe.totalTimeMinutes} min · {state.result.recipe.difficulty} ·{' '}
              {state.result.recipe.servings} {state.result.recipe.servings === 1 ? 'serving' : 'servings'}
            </span>

            {/*
              Stream H, and this surface is where the check earns its keep. The
              Library tab is GROUNDED; this one is FREE — the model invents the
              ingredient list, and per D1 the row is already saved by the time
              this renders. It sits UNDER the saved line on purpose: the recipe
              was saved, and the finding does not retract that. It is something
              to know before cooking, not an error about the write.
            */}
            <DietaryConflictBadge checks={state.result.dietaryChecks} style={{ marginTop: 9 }} />

            <div style={resultActions}>
              <Link to={`/recipes/${state.result.recipe.id}`} style={openButton}>
                Open recipe
              </Link>
              <button type="button" onClick={state.reset} style={anotherButton}>
                Try another
              </button>
            </div>
          </div>
          <p style={budgetLine}>
            {state.result.budget.callsRemaining}{' '}
            {state.result.budget.callsRemaining === 1 ? 'AI call' : 'AI calls'} left today
          </p>
        </>
      )}
    </div>
  )
}

/**
 * The Library tab's one route into Create: "nothing above quite right?".
 *
 * This is all that survives of the old card's chrome. It deliberately has no
 * text field — the moment it offered one, the thread had two inputs and the
 * user had to work out which engine each one fed. Now it just changes tabs, and
 * the composer that appears is unmistakably a different one.
 */
export function CreateHandoff({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{ marginTop: 6 }}>
      <p style={handoffHint}>Nothing quite right?</p>
      <button type="button" onClick={onCreate} style={handoffButton}>
        <SparkIcon size={14} />
        Write me a new one
      </button>
    </div>
  )
}

const contextChip: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 12.5,
  color: 'var(--olive)',
  background: 'var(--accent-soft)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '8px 11px',
  marginBottom: 18,
}

const emptyWrap: CSSProperties = { textAlign: 'center', padding: '26px 8px 0' }

const emptyTitle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: '-0.01em',
}

const emptyLine: CSSProperties = {
  fontSize: 13.5,
  color: 'var(--muted)',
  margin: '0 auto 10px',
  maxWidth: '30ch',
  lineHeight: 1.45,
}

const promptBubble: CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  borderRadius: '18px 6px 18px 18px',
  padding: '14px 16px',
  fontSize: 15,
  lineHeight: 1.5,
  margin: '0 0 12px auto',
  maxWidth: '82%',
  fontWeight: 500,
  whiteSpace: 'pre-wrap',
}

// Not the grey typing bubble: writing a recipe takes longer than answering a
// question, and the wait should admit it is a different act. The label carries
// that on its own — in the light theme --olive and --accent are one step apart,
// so the colour here agrees with the distinction rather than making it.
const writingBubble: CSSProperties = {
  background: 'var(--accent-soft)',
  borderRadius: '6px 18px 18px 18px',
  padding: '13px 15px',
  marginBottom: 12,
  maxWidth: '88%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13.5,
  fontWeight: 700,
  color: 'var(--olive)',
}

const writingDot: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--olive)',
  display: 'inline-block',
  animation: 'chat-typing 1.2s ease-in-out infinite',
}

// Solid border, filled ground — deliberately unlike a library suggestion's
// hairline card, so the two can never be skimmed as the same kind of thing.
const resultCard: CSSProperties = {
  background: 'var(--surface)',
  border: '2px solid var(--olive)',
  borderRadius: 16,
  padding: '12px 13px',
  display: 'flex',
  flexDirection: 'column',
  marginBottom: 4,
}

const resultEyebrow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'var(--olive)',
  marginBottom: 6,
}

const resultTitle: CSSProperties = { fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }

const resultMeta: CSSProperties = { fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }

const resultActions: CSSProperties = { display: 'flex', gap: 8, marginTop: 12 }

const openButton: CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '8px 15px',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--olive)',
  color: 'var(--olive-ink)',
  fontFamily: 'inherit',
  textDecoration: 'none',
}

const anotherButton: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '8px 15px',
  fontSize: 13,
  fontWeight: 700,
  background: 'none',
  color: 'var(--text)',
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const budgetLine: CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  textAlign: 'center',
  margin: '10px 0 0',
}

const errorText: CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  color: 'var(--muted)',
  fontWeight: 600,
  marginBottom: 10,
}

const fallbackButton: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 12,
  padding: '12px 14px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  marginBottom: 9,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  cursor: 'pointer',
}

const fallbackPrimary: CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  borderColor: 'transparent',
}

const handoffHint: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--muted)',
  textAlign: 'center',
  margin: '14px 0 8px',
}

const handoffButton: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  background: 'none',
  border: '1.5px dashed var(--olive)',
  color: 'var(--olive)',
  borderRadius: 999,
  padding: '10px 14px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  cursor: 'pointer',
}
