// ─────────────────────────────────────────────────────────────────────────
// Edit profile (design 3f) — the real, persisting account form behind
// Settings → Account → Edit profile. Fields map 1:1 to PUT /users/me: username
// (globally unique — a clash surfaces inline), bio (160-char counter), profile
// photo (reuses the shared multipart upload), and the default visibility applied
// to new recipes. Seeded from the caller's own GET /users/{me}.
// ─────────────────────────────────────────────────────────────────────────

import { useRef, useState, type CSSProperties } from 'react'
import { ApiConflictError, ApiValidationError } from '@/api/client'
import { IMAGE_ACCEPT, IMAGE_ALLOWED_TYPES, IMAGE_MAX_BYTES, uploadImage } from '@/api/images'
import type { UserProfileResponse } from '@/api/social'
import type { Visibility } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import Avatar from '@/components/Avatar'
import { useUpdateProfile } from '@/hooks/useUserProfile'
import { SectionLabel, SettingsScreen } from './settingsUi'
import type { Cuisine, DietaryRestriction } from '@/api/types'
import { CUISINES, DIETARY_RESTRICTIONS, label } from '@/api/vocabulary'

const BIO_MAX = 160

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'Public', label: 'Public' },
  { value: 'FriendsOnly', label: 'Friends' },
  { value: 'Private', label: 'Private' },
]

interface Props {
  profile: UserProfileResponse
  onBack: () => void
}

export default function EditProfileView({ profile, onBack }: Props) {
  const { updateUsername } = useAuth()
  const update = useUpdateProfile()

  const [username, setUsername] = useState(profile.username)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [imageUrl, setImageUrl] = useState<string | null>(profile.profileImageUrl ?? null)
  const [visibility, setVisibility] = useState<Visibility>(profile.defaultRecipeVisibility)
  const [restrictions, setRestrictions] = useState<DietaryRestriction[]>(profile.dietaryRestrictions ?? [])
  const [cuisines, setCuisines] = useState<Cuisine[]>(profile.cuisinePreferences ?? [])

  const [banner, setBanner] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  // ── Photo upload (mirrors the recipe form's cp07 pattern) ────────────────
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadPending, setUploadPending] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const uploadRef = useRef<{ seq: number; controller: AbortController | null }>({ seq: 0, controller: null })

  const previewUrl = localPreview ?? imageUrl

  const handlePhotoSelected = async (file: File) => {
    setUploadError(null)
    if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
      setUploadError('That file type is not supported — choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setUploadError('That image is too large — the limit is 5 MB.')
      return
    }

    uploadRef.current.controller?.abort()
    const controller = new AbortController()
    const seq = ++uploadRef.current.seq
    uploadRef.current.controller = controller

    let local: string | null = null
    try {
      if (typeof URL.createObjectURL === 'function') local = URL.createObjectURL(file)
    } catch {
      local = null
    }
    setLocalPreview(local)
    setUploadPending(true)

    try {
      const { url } = await uploadImage(file, { signal: controller.signal })
      if (seq !== uploadRef.current.seq) return
      setImageUrl(url)
    } catch (err) {
      if (seq !== uploadRef.current.seq || controller.signal.aborted) return
      setUploadError(
        err instanceof ApiValidationError
          ? 'That image was rejected — choose a JPEG, PNG, or WebP under 5 MB.'
          : 'The photo upload failed. Check your connection and try again.',
      )
    } finally {
      if (seq === uploadRef.current.seq) {
        setUploadPending(false)
        setLocalPreview(null)
        uploadRef.current.controller = null
      }
      if (local && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(local)
    }
  }

  const removePhoto = () => {
    uploadRef.current.controller?.abort()
    uploadRef.current.seq++
    uploadRef.current.controller = null
    setUploadPending(false)
    setLocalPreview(null)
    setUploadError(null)
    setImageUrl(null)
  }

  const trimmedName = username.trim()
  const canSave = trimmedName.length >= 3 && !uploadPending && !update.isPending

  const handleSave = async () => {
    setBanner(null)
    setUsernameError(null)
    try {
      const updated = await update.mutateAsync({
        username: trimmedName,
        bio: bio.trim() ? bio.trim() : null,
        profileImageUrl: imageUrl,
        defaultRecipeVisibility: visibility,
        dietaryRestrictions: restrictions,
        cuisinePreferences: cuisines,
      })
      updateUsername(updated.username)
      onBack()
    } catch (err) {
      if (err instanceof ApiConflictError) {
        setUsernameError('That username is already taken.')
      } else if (err instanceof ApiValidationError) {
        const first = Object.values(err.errors)[0]?.[0]
        setBanner(first ?? 'Please fix the highlighted fields.')
      } else {
        setBanner('Could not save your profile. Check your connection and try again.')
      }
    }
  }

  const saveBtn = (
    <button onClick={handleSave} disabled={!canSave} style={saveButton(canSave)}>
      {update.isPending ? 'Saving…' : 'Save'}
    </button>
  )

  return (
    <SettingsScreen title="Edit profile" onBack={onBack} right={saveBtn}>
      {banner && (
        <div role="alert" style={bannerStyle}>
          {banner}
        </div>
      )}

      {/* Avatar + change photo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 22 }}>
        <div style={{ position: 'relative' }}>
          <Avatar username={trimmedName || profile.username} profileImageUrl={previewUrl} seed={profile.id} size={88} />
          <button
            type="button"
            aria-label="Change photo"
            onClick={() => fileRef.current?.click()}
            style={cameraBadge}
          >
            ✎
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handlePhotoSelected(file)
            e.target.value = ''
          }}
        />
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10 }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={linkBtn('var(--accent)')}>
            {uploadPending ? 'Uploading…' : 'Change photo'}
          </button>
          {previewUrl && !uploadPending && (
            <button type="button" onClick={removePhoto} style={linkBtn('var(--muted)')}>
              Remove
            </button>
          )}
        </div>
        {uploadError && <div style={{ fontSize: 12, color: '#d9534f', marginTop: 8 }}>{uploadError}</div>}
      </div>

      {/* Username */}
      <SectionLabel>Username</SectionLabel>
      <input
        value={username}
        onChange={(e) => {
          setUsername(e.target.value)
          setUsernameError(null)
        }}
        aria-label="Username"
        aria-invalid={!!usernameError}
        maxLength={50}
        style={fieldInput(!!usernameError)}
      />
      {usernameError ? (
        <div style={hintError}>{usernameError}</div>
      ) : (
        trimmedName.length > 0 &&
        trimmedName.length < 3 && <div style={hintError}>Usernames are at least 3 characters.</div>
      )}

      {/* Bio */}
      <SectionLabel style={{ marginTop: 18 }}>Bio</SectionLabel>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
        aria-label="Bio"
        rows={3}
        placeholder="Tell people what you cook."
        style={{ ...fieldInput(false), minHeight: 74, resize: 'vertical', lineHeight: 1.5 }}
      />
      <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
        {bio.length} / {BIO_MAX}
      </div>

      {/* Default recipe visibility */}
      <SectionLabel style={{ marginTop: 18 }}>Default recipe visibility</SectionLabel>
      <div style={{ display: 'flex', gap: 8 }}>
        {VISIBILITY_OPTIONS.map((o) => {
          const active = visibility === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setVisibility(o.value)}
              aria-pressed={active}
              style={segment(active)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
        Applied to new recipes by default. You can still change it per recipe.
        {/* stream F (decision D6): the "Friends" segment is a MUTUAL follow. Spelled out
            only while it is selected, so the line stays one sentence for everyone else. */}
        {visibility === 'FriendsOnly' && ' Friends are people you follow who follow you back.'}
      </div>

      {/* Dietary restrictions (stream G, D10). A chip set rather than a text
          field because these are the one setting that leaves the app: they are
          injected into every AI system prompt as an absolute constraint, so a
          typo used to become a rule the model was asked to honour and could
          not. A closed vocabulary is also what lets slice G4 CHECK a recipe
          against them instead of only asking the model to respect them. */}
      <SectionLabel style={{ marginTop: 18 }}>Dietary restrictions</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {DIETARY_RESTRICTIONS.map((restriction) => {
          const active = restrictions.includes(restriction)
          return (
            <button
              key={restriction}
              type="button"
              role="checkbox"
              aria-checked={active}
              aria-label={label(restriction)}
              onClick={() =>
                setRestrictions((prev) =>
                  prev.includes(restriction)
                    ? prev.filter((r) => r !== restriction)
                    : // Rebuilt in vocabulary order, so the saved list never
                      // reads in click order.
                      DIETARY_RESTRICTIONS.filter((r) => r === restriction || prev.includes(r)),
                )
              }
              style={restrictionChip(active)}
            >
              {label(restriction)}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
        Used to constrain every recipe the assistant suggests or generates for you.
      </div>

      {/* Cuisine preferences (stream K, onboarding). The wizard collects these
          once at registration; this is where they stay editable — a preference
          you can set only on the day you sign up is one you are stuck with.
          Placed directly BELOW the restrictions on purpose: the two are easy to
          confuse, and reading them in this order (hard rules, then soft leaning)
          is what the helper text under each is there to settle. */}
      <SectionLabel style={{ marginTop: 18 }}>Cuisines you prefer</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {CUISINES.map((cuisine) => {
          const active = cuisines.includes(cuisine)
          return (
            <button
              key={cuisine}
              type="button"
              role="checkbox"
              aria-checked={active}
              aria-label={label(cuisine)}
              onClick={() =>
                setCuisines((prev) =>
                  prev.includes(cuisine)
                    ? prev.filter((c) => c !== cuisine)
                    : CUISINES.filter((c) => c === cuisine || prev.includes(c)),
                )
              }
              style={restrictionChip(active)}
            >
              {label(cuisine)}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
        A gentle lean, not a filter — it breaks ties when the assistant suggests or plans, and
        never hides a recipe from you.
      </div>
    </SettingsScreen>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

function restrictionChip(active: boolean): CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 12.5,
    fontWeight: active ? 700 : 500,
    padding: '6px 11px',
    borderRadius: 999,
    cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    // Same token choice as TagPicker — the deeper --accent, not --accent-fill,
    // so 12.5px label text stays above 4.5:1. See that component's note.
    background: active ? 'var(--accent)' : 'var(--chipbg)',
    color: active ? 'var(--accent-ink)' : 'var(--muted)',
  }
}

function saveButton(enabled: boolean): CSSProperties {
  return {
    flexShrink: 0,
    border: 'none',
    background: 'transparent',
    cursor: enabled ? 'pointer' : 'default',
    fontFamily: 'inherit',
    fontSize: 15,
    fontWeight: 800,
    color: enabled ? 'var(--accent)' : 'var(--muted)',
    padding: '6px 4px',
  }
}

const cameraBadge: CSSProperties = {
  position: 'absolute',
  bottom: -2,
  right: -2,
  width: 30,
  height: 30,
  borderRadius: '50%',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  border: '3px solid var(--surface)',
  cursor: 'pointer',
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
}

function linkBtn(color: string): CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12.5,
    fontWeight: 700,
    color,
    padding: 0,
  }
}

function fieldInput(invalid: boolean): CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--surface)',
    border: `1px solid ${invalid ? 'rgba(217, 83, 79, 0.6)' : 'var(--border)'}`,
    borderRadius: 13,
    padding: '12px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
    color: 'var(--text)',
    outline: 'none',
  }
}

function segment(active: boolean): CSSProperties {
  return {
    flex: 1,
    textAlign: 'center',
    cursor: 'pointer',
    borderRadius: 12,
    padding: '10px 0',
    fontSize: 13,
    fontWeight: active ? 800 : 700,
    fontFamily: 'inherit',
    border: active ? 'none' : '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--surface)',
    color: active ? 'var(--accent-ink)' : 'var(--muted)',
  }
}

const hintError: CSSProperties = { fontSize: 12, color: '#d9534f', marginTop: 6 }

const bannerStyle: CSSProperties = {
  fontSize: 13,
  color: '#d9534f',
  background: 'rgba(217, 83, 79, 0.10)',
  border: '1px solid rgba(217, 83, 79, 0.35)',
  borderRadius: 12,
  padding: '10px 12px',
  marginBottom: 16,
}
