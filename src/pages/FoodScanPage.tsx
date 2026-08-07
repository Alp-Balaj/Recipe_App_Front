// Food scanner page (/scan) — stream N.
//
// Two modes, two different products. A PANTRY scan answers with things that
// already exist — detected ingredients and deterministic matches into recipes
// the user can open — so its result is links, not writes. A RECEIPT scan
// answers with a DRAFT: nothing lands on the shopping list until the user has
// unticked the noise and pressed the one button, at which point each kept line
// goes through the existing manual-add endpoint. The scan itself saves nothing,
// which is also why the photo never gets an upload progress bar into storage —
// it is read once and discarded (backend decision D19).
//
// The camera affordance is the genuinely new ground: `capture="environment"`
// on the file input is what makes this a SCAN on a phone — the rear camera
// opens directly — while remaining an ordinary file picker on desktop.
import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { weekStartOf } from '@/api/mealPlans'
import { addManualItem } from '@/api/shopping'
import {
  SCAN_PHOTO_ACCEPT,
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

export default function FoodScanPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'receipt' ? 'receipt' : 'pantry')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pantry, setPantry] = useState<PantryScanResponse | null>(null)
  const [receipt, setReceipt] = useState<ReceiptScanResponse | null>(null)
  const [kept, setKept] = useState<boolean[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  async function submitPhoto(file: File) {
    if (pending) return

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
      // Let the same photo be chosen again after a failure.
      if (fileInput.current) fileInput.current.value = ''
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

  const keptItems = receipt ? receipt.items.filter((_, i) => kept[i]) : []

  return (
    <div
      className="scroll"
      style={{
        position: 'absolute',
        inset: 0,
        bottom: 'var(--nav-h, 74px)',
        overflowY: 'auto',
        padding: '54px 18px 24px',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Scan</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, marginBottom: 18 }}>
        Point the camera at your shelf, or at a receipt
      </div>

      <div role="tablist" aria-label="Scan mode" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <ModeTab current={mode} value="pantry" onSelect={switchMode} disabled={!!pending}>
          What can I cook?
        </ModeTab>
        <ModeTab current={mode} value="receipt" onSelect={switchMode} disabled={!!pending}>
          Receipt to list
        </ModeTab>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
        {mode === 'pantry'
          ? 'A fridge shelf, a counter, a cupboard. We list what’s visible and find recipes you could cook — nothing is guessed at, so an empty photo comes back empty.'
          : 'A shop receipt. We read the purchased lines into a draft — nothing lands on your list until you confirm it.'}
      </div>

      <label htmlFor="scan-photo" style={labelStyle}>
        {mode === 'pantry' ? 'Photo of your food' : 'Photo of the receipt'}
      </label>
      <input
        id="scan-photo"
        ref={fileInput}
        type="file"
        accept={SCAN_PHOTO_ACCEPT}
        capture="environment"
        disabled={!!pending}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void submitPhoto(file)
        }}
        style={{ fontFamily: 'inherit', fontSize: 13.5, marginBottom: 14 }}
      />
      {pending && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{pending}</div>}

      {error && (
        <div role="alert" style={alertStyle}>
          {error}
        </div>
      )}

      {mode === 'pantry' && pantry && !pending && (
        <PantryResults result={pantry} />
      )}

      {mode === 'receipt' && receipt && !pending && (
        <ReceiptDraft
          result={receipt}
          kept={kept}
          onToggle={(i) => setKept((k) => k.map((v, j) => (j === i ? !v : v)))}
          onConfirm={() => void confirmReceipt(keptItems)}
        />
      )}
    </div>
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
    <div style={{ marginTop: 18 }}>
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

function ReceiptDraft({
  result,
  kept,
  onToggle,
  onConfirm,
}: {
  result: ReceiptScanResponse
  kept: boolean[]
  onToggle: (index: number) => void
  onConfirm: () => void
}) {
  if (result.items.length === 0) {
    return (
      <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 18, lineHeight: 1.55 }}>
        We couldn’t read any purchases off that photo. Try a flatter, brighter shot of the
        receipt.
      </div>
    )
  }

  const keptCount = kept.filter(Boolean).length

  return (
    <div style={{ marginTop: 18 }}>
      <div style={sectionHeadStyle}>Draft — untick anything you don’t want</div>
      {result.items.map((item, i) => (
        <label
          key={`${item.name}-${i}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 4px',
            borderBottom: '1px solid var(--border)',
            fontSize: 13.5,
            cursor: 'pointer',
          }}
        >
          <input type="checkbox" checked={kept[i] ?? false} onChange={() => onToggle(i)} />
          <span style={{ fontWeight: 600, flex: 1 }}>{item.name}</span>
          {item.quantity && <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{item.quantity}</span>}
        </label>
      ))}
      <button
        type="button"
        disabled={keptCount === 0}
        onClick={onConfirm}
        style={{
          cursor: keptCount === 0 ? 'default' : 'pointer',
          border: 'none',
          borderRadius: 12,
          padding: '11px 16px',
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 700,
          width: '100%',
          marginTop: 14,
          opacity: keptCount === 0 ? 0.55 : 1,
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
        }}
      >
        Add {keptCount} item{keptCount === 1 ? '' : 's'} to this week’s list
      </button>
    </div>
  )
}

function ModeTab({
  current,
  value,
  onSelect,
  disabled,
  children,
}: {
  current: Mode
  value: Mode
  onSelect: (mode: Mode) => void
  disabled: boolean
  children: React.ReactNode
}) {
  const active = current === value
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={() => onSelect(value)}
      style={{
        cursor: disabled ? 'default' : 'pointer',
        border: '1px solid transparent',
        borderRadius: 10,
        padding: '7px 14px',
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 700,
        opacity: disabled && !active ? 0.55 : 1,
        background: active ? 'var(--accent)' : 'var(--chipbg)',
        color: active ? 'var(--accent-ink)' : 'var(--chipcol)',
      }}
    >
      {children}
    </button>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 700,
  marginBottom: 6,
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
