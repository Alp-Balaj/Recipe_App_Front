// Import-recipe page (/recipes/import) — stream L.
//
// Two ways in, one outcome. A URL, or a photo of a written recipe; either way
// the server answers with an ordinary recipe row and this page routes to
// /recipes/{id}, exactly as the generator's surface does. There is no preview
// step and deliberately so: the recipe is already saved and already PRIVATE
// (decision D15), so the honest place to review an import is the recipe's own
// detail page, where every field is editable — not a bespoke confirmation
// screen that would have to reimplement the form to be useful.
//
// The one piece of real UI thinking here is the WAIT. A URL import is a fetch
// plus possibly a model call plus possibly an image download, and it is
// synchronous, so this page can sit for ten seconds with nothing to say. The
// pending copy therefore names what is happening rather than spinning
// anonymously — "Fetching the page…" is the difference between a slow feature
// and a broken one.
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthContext'
import { queryKeys } from '@/api/queryKeys'
import {
  IMPORT_PHOTO_ACCEPT,
  IMPORT_PHOTO_MAX_BYTES,
  importErrorMessage,
  importRecipeFromPhoto,
  importRecipeFromUrl,
  type ImportRecipeResponse,
} from '@/api/import'

const ERROR_COLOR = '#d9534f'

type Mode = 'url' | 'photo'

export default function RecipeImportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [mode, setMode] = useState<Mode>('url')
  const [url, setUrl] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  function finish(result: ImportRecipeResponse) {
    // The new recipe is private and belongs to the caller, so the only list it
    // can appear in is their own. Invalidating rather than seeding: the import
    // response is a full RecipeResponse, but /recipes/mine is a keyset list and
    // splicing a row into the right page of it is more machinery than a refetch.
    queryClient.invalidateQueries({ queryKey: queryKeys.recipes.mine() })
    navigate(`/recipes/${result.recipe.id}`)
  }

  async function submitUrl(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return

    const trimmed = url.trim()
    if (!trimmed) {
      setError('Paste the address of a recipe page first.')
      return
    }

    setError(null)
    setPending('Fetching the page…')
    try {
      finish(await importRecipeFromUrl(trimmed, { token: user?.token }))
    } catch (err) {
      setError(importErrorMessage(err))
      setPending(null)
    }
  }

  async function submitPhoto(file: File) {
    if (pending) return

    // Checked here as well as server-side so an oversized photo fails instantly
    // instead of after uploading several megabytes to be told no.
    if (file.size > IMPORT_PHOTO_MAX_BYTES) {
      setError(`That photo is larger than ${IMPORT_PHOTO_MAX_BYTES / (1024 * 1024)} MB.`)
      return
    }

    setError(null)
    setPending('Reading the recipe…')
    try {
      finish(await importRecipeFromPhoto(file, { token: user?.token }))
    } catch (err) {
      setError(importErrorMessage(err))
      setPending(null)
    } finally {
      // Let the same file be chosen again after a failure — without this, picking
      // the identical photo fires no change event and the page looks frozen.
      if (fileInput.current) fileInput.current.value = ''
    }
  }

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
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Import a recipe</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, marginBottom: 18 }}>
        From a website, or a photo of a written one
      </div>

      <div role="tablist" aria-label="Import source" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <ModeTab current={mode} value="url" onSelect={setMode} disabled={!!pending}>
          Website
        </ModeTab>
        <ModeTab current={mode} value="photo" onSelect={setMode} disabled={!!pending}>
          Photo
        </ModeTab>
      </div>

      {mode === 'url' ? (
        <form onSubmit={submitUrl}>
          <label htmlFor="import-url" style={labelStyle}>
            Recipe address
          </label>
          <input
            id="import-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://…"
            value={url}
            disabled={!!pending}
            onChange={(e) => setUrl(e.target.value)}
            style={inputStyle}
          />
          <button type="submit" disabled={!!pending} style={primaryButtonStyle(!!pending)}>
            {pending ?? 'Import recipe'}
          </button>
        </form>
      ) : (
        <div>
          <label htmlFor="import-photo" style={labelStyle}>
            Photo of a written recipe
          </label>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
            A cookbook page, a screenshot, or a handwritten card. A photo of the finished dish
            won't work — we read the words, not the food.
          </div>
          <input
            id="import-photo"
            ref={fileInput}
            type="file"
            accept={IMPORT_PHOTO_ACCEPT}
            disabled={!!pending}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void submitPhoto(file)
            }}
            style={{ fontFamily: 'inherit', fontSize: 13.5, marginBottom: 14 }}
          />
          {pending && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{pending}</div>}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            fontSize: 13,
            color: ERROR_COLOR,
            background: 'rgba(217, 83, 79, 0.10)',
            border: '1px solid rgba(217, 83, 79, 0.35)',
            borderRadius: 12,
            padding: '10px 12px',
            marginTop: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* D15, said out loud rather than left to be discovered. An imported recipe
          is somebody else's writing sitting in this user's account, so it lands
          private and the promotion to public is theirs to make deliberately. */}
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 22, lineHeight: 1.55 }}>
        Imported recipes are saved privately and credited to their source. Check it over before
        you share it.
      </div>
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--card)',
  color: 'inherit',
  fontFamily: 'inherit',
  fontSize: 14,
  padding: '11px 12px',
  marginBottom: 14,
}

function primaryButtonStyle(pending: boolean): React.CSSProperties {
  return {
    cursor: pending ? 'default' : 'pointer',
    border: 'none',
    borderRadius: 12,
    padding: '11px 16px',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 700,
    width: '100%',
    opacity: pending ? 0.7 : 1,
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
  }
}
