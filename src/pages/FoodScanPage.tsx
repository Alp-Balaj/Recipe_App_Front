// Food scanner page (/scan) — stream N, recomposed by the Scan redesign.
//
// Two modes, two different products. A PANTRY scan answers with things that
// already exist — detected ingredients and deterministic matches into recipes
// the user can open — so its result is links, not writes. A RECEIPT scan
// answers with a DRAFT: nothing lands on the shopping list until the user has
// swiped away the noise and pressed the one button, at which point each kept
// line goes through the existing manual-add endpoint. The scan itself saves
// nothing, which is also why the photo never gets an upload progress bar into
// storage — it is read once and discarded (backend decision D19).
//
// ── What the redesign changed (UI only; every call below is the one it was) ──
//
// The page used to open on a tablist: two abstract modes to choose between
// before you knew what either did, then helper prose, then a bare file input
// carrying the entire capture experience. It now ASKS FIRST — two named jobs in
// the user's own words — and then runs the chosen job as three visible steps.
//
//   /scan                → the intent picker
//   /scan?mode=pantry    → step 1 of "What can I cook?"
//   /scan?mode=receipt   → step 1 of "Receipt → list"
//
// The mode lives in the URL rather than in state, so the picker is a real
// destination the browser's Back button can return to, and the shopping list's
// existing /scan?mode=receipt link still lands exactly where it did.
//
// The camera affordance is unchanged and unchangeable: `capture="environment"`
// on the file input is what makes this a SCAN on a phone — the rear camera
// opens directly. CaptureZone wraps that input, it does not replace it.
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { weekStartOf } from '@/api/mealPlans'
import { addManualItem } from '@/api/shopping'
import CaptureZone from '@/components/scan/CaptureZone'
import ReceiptReview from '@/components/scan/ReceiptReview'
import ScanStepper from '@/components/scan/ScanStepper'
import { DiscoverIcon, ShopIcon, type IconProps } from '@/components/navIcons'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  SCAN_PHOTO_MAX_BYTES,
  scanErrorMessage,
  scanPantry,
  scanReceipt,
  type PantryScanResponse,
  type ReceiptItem,
  type ReceiptScanResponse,
} from '@/api/scan'

const ERROR_COLOR = '#d9534f'

type Mode = 'pantry' | 'receipt'

/**
 * The two jobs, stated the way the user would state them. Everything the flow
 * says about itself — the card, the back link, the step labels, the input's
 * accessible name, the reassurance under the capture zone — comes from here, so
 * the two modes cannot drift into saying different kinds of thing.
 */
const JOBS: Record<Mode, {
  icon: (props: IconProps) => JSX.Element
  title: string
  body: string
  cta: string
  steps: readonly [string, string, string]
  inputLabel: string
  helper: string
}> = {
  pantry: {
    icon: DiscoverIcon,
    title: 'What can I cook?',
    body: 'Snap your fridge, shelf or counter. We list what’s there and find recipes you could make tonight.',
    cta: 'Snap your shelf ›',
    steps: ['Snap', 'Review', 'Cook'],
    inputLabel: 'Photo of your food',
    helper: 'Good light helps. An empty photo comes back empty — nothing is guessed at.',
  },
  receipt: {
    icon: ShopIcon,
    title: 'Receipt → list',
    body: 'Snap a shop receipt. We read the lines into a draft you confirm — nothing lands on your list by itself.',
    cta: 'Snap a receipt ›',
    steps: ['Snap', 'Review', 'Done'],
    inputLabel: 'Photo of the receipt',
    helper: 'A flat, bright shot reads best. Nothing reaches your list until you confirm the draft.',
  },
}

function readMode(value: string | null): Mode | null {
  return value === 'pantry' || value === 'receipt' ? value : null
}

export default function FoodScanPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const mode = readMode(searchParams.get('mode'))

  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pantry, setPantry] = useState<PantryScanResponse | null>(null)
  const [receipt, setReceipt] = useState<ReceiptScanResponse | null>(null)
  const [kept, setKept] = useState<boolean[]>([])

  function pickJob(next: Mode) {
    setError(null)
    setSearchParams({ mode: next })
  }

  /** ‹ back — to the picker, with the flow's results dropped behind it. */
  function backToPicker() {
    setError(null)
    setPantry(null)
    setReceipt(null)
    setKept([])
    setSearchParams({})
  }

  async function submitPhoto(file: File) {
    if (pending || !mode) return

    // Checked here as well as server-side so an oversized photo fails instantly
    // instead of after uploading several megabytes to be told no.
    if (file.size > SCAN_PHOTO_MAX_BYTES) {
      setError(`That photo is larger than ${SCAN_PHOTO_MAX_BYTES / (1024 * 1024)} MB.`)
      return
    }

    setError(null)
    setPending(mode === 'pantry' ? 'Reading what you have…' : 'Reading the receipt…')
    try {
      if (mode === 'pantry') {
        setPantry(await scanPantry(file, { token: user?.token }))
      } else {
        const result = await scanReceipt(file, { token: user?.token })
        setReceipt(result)
        setKept(result.items.map(() => true))
      }
    } catch (err) {
      setError(scanErrorMessage(err))
    } finally {
      setPending(null)
    }
  }

  async function confirmReceipt(items: ReceiptItem[]) {
    if (pending) return
    setError(null)
    setPending('Adding to your list…')

    // One POST per kept line through the EXISTING manual-add endpoint — the
    // scan endpoint wrote nothing, and this is the user's confirmation. The
    // week is the current UTC-midnight Monday, which is the only value the
    // backend accepts (anything else is an invisible phantom-week row).
    const week = weekStartOf(new Date())
    let added = 0
    try {
      for (const item of items) {
        await addManualItem({
          ingredient: item.name,
          // The manual row's quantity is required free text; a receipt line
          // with no printed amount becomes a plain "1".
          quantity: item.quantity ?? '1',
          weekStartDate: week,
        })
        added += 1
      }
      navigate('/shopping-list')
    } catch (err) {
      setPending(null)
      setError(
        added > 0
          ? `Added ${added} of ${items.length} before something went wrong — the rest are still here. ${scanErrorMessage(err)}`
          : scanErrorMessage(err),
      )
    }
  }

  const pageStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    bottom: 'var(--nav-h, 74px)',
    overflowY: 'auto',
    padding: '54px 18px 24px',
    display: 'flex',
    flexDirection: 'column',
  }

  // ── The landing screen: pick the job, not the mode ────────────────────────
  if (!mode) {
    return (
      <div className="scroll" style={pageStyle}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Scan</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, marginBottom: isDesktop ? 22 : 20 }}>
          What are we looking at?
        </div>
        <div
          style={
            isDesktop
              ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }
              : { display: 'flex', flexDirection: 'column', gap: 14 }
          }
        >
          {(['pantry', 'receipt'] as const).map((job) => (
            <IntentCard key={job} job={JOBS[job]} onPick={() => pickJob(job)} />
          ))}
        </div>
      </div>
    )
  }

  // ── The chosen job, as three steps ───────────────────────────────────────
  const job = JOBS[mode]
  const result = mode === 'pantry' ? pantry : receipt
  // Which step you are on is "has this job come back yet", NOT "is anything in
  // flight" — confirming a receipt sets `pending` too, and keying off that would
  // yank the draft out from under the user and show them the camera again.
  const step = result ? 2 : 1
  const keptItems = receipt ? receipt.items.filter((_, i) => kept[i]) : []

  return (
    <div className="scroll" style={pageStyle}>
      <button type="button" onClick={backToPicker} style={backLink}>
        ‹ {job.title}
      </button>

      <div style={{ marginBottom: step === 1 ? 22 : 18 }}>
        <ScanStepper steps={job.steps} current={step} maxWidth={isDesktop ? 420 : undefined} />
      </div>

      {step === 1 && (
        <CaptureZone
          inputLabel={job.inputLabel}
          isDesktop={isDesktop}
          disabled={!!pending}
          onFile={(file) => void submitPhoto(file)}
          helper={job.helper}
        />
      )}

      {pending && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 14 }}>{pending}</div>}

      {error && (
        <div role="alert" style={alertStyle}>
          {error}
        </div>
      )}

      {mode === 'pantry' && pantry && <PantryResults result={pantry} />}

      {mode === 'receipt' && receipt && (
        <ReceiptReview
          items={receipt.items}
          kept={kept}
          disabled={!!pending}
          onSetKept={(i, keep) => setKept((k) => k.map((v, j) => (j === i ? keep : v)))}
          onConfirm={() => void confirmReceipt(keptItems)}
        />
      )}
    </div>
  )
}

/** One of the two jobs, as a card you tap to start it. */
function IntentCard({ job, onPick }: { job: (typeof JOBS)[Mode]; onPick: () => void }) {
  const Icon = job.icon
  return (
    <button
      type="button"
      onClick={onPick}
      className="intent-card"
      style={{
        textAlign: 'left',
        cursor: 'pointer',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 20,
        padding: '18px 16px',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        fontFamily: 'inherit',
        color: 'var(--text)',
      }}
    >
      <span
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          background: 'var(--chipbg)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={22} />
      </span>
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: '-0.01em' }}>{job.title}</span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{job.body}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{job.cta}</span>
      </span>
    </button>
  )
}

function PantryResults({ result }: { result: PantryScanResponse }) {
  if (result.detected.length === 0) {
    return (
      <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 18, lineHeight: 1.55 }}>
        We couldn’t see any food in that photo. Nothing was guessed at — try a closer shot with
        more light.
      </div>
    )
  }

  const unresolved = result.detected.filter((d) => d.ingredientId === null)

  return (
    <div style={{ marginTop: 4 }}>
      <div style={sectionHeadStyle}>We can see</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {result.detected.map((d) => (
          <span
            key={d.name}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 999,
              padding: '4px 10px',
              background: 'var(--chipbg)',
              border: d.ingredientId === null ? '1px dashed var(--border)' : '1px solid transparent',
              opacity: d.ingredientId === null ? 0.75 : 1,
            }}
          >
            {d.name}
          </span>
        ))}
      </div>
      {unresolved.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          We don’t know {unresolved.map((d) => `“${d.name}”`).join(', ')} — {unresolved.length === 1 ? 'it' : 'they'} still
          counted when matching by name.
        </div>
      )}

      <div style={sectionHeadStyle}>
        {result.matches.length > 0 ? 'You could cook' : 'No matches'}
      </div>
      {result.matches.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
          Nothing you can see uses these ingredients yet.
        </div>
      )}
      {result.matches.map((m) => (
        <Link
          key={m.recipeId}
          to={`/recipes/${m.recipeId}`}
          style={{
            display: 'block',
            textDecoration: 'none',
            color: 'inherit',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--cardsh)',
            borderRadius: 18,
            padding: '12px 14px',
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {m.imageUrl && (
              <img
                src={m.imageUrl}
                alt=""
                style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{m.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                You have {m.matchedIngredientCount} of {m.totalIngredientCount} ingredients
                {' · '}{m.totalTimeMinutes} min
              </div>
              {m.missingIngredientNames.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Missing: {m.missingIngredientNames.join(', ')}
                </div>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

const backLink: React.CSSProperties = {
  alignSelf: 'flex-start',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--accent)',
  padding: 0,
  marginBottom: 12,
}

const sectionHeadStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  marginBottom: 8,
}

const alertStyle: React.CSSProperties = {
  fontSize: 13,
  color: ERROR_COLOR,
  background: 'rgba(217, 83, 79, 0.10)',
  border: '1px solid rgba(217, 83, 79, 0.35)',
  borderRadius: 12,
  padding: '10px 12px',
  marginTop: 16,
}
