// ─────────────────────────────────────────────────────────────────────────
// Step 1 of the scan flow — "Snap" (Scan redesign).
//
// What this replaces: a bare <input type="file"> under a bold label. The input
// is still here and still carries `capture="environment"` — that attribute is
// the whole reason a scan is a scan on a phone, so the guided UI is a WRAPPER
// around it, never a replacement for it. Everything visible is a styled button
// that clicks one of the two inputs underneath.
//
// Two inputs, not one: `capture` forces the camera, which is right for "Open
// camera" and wrong for "or choose a photo" — the same input cannot be both.
//
// Desktop gets the mouse-first affordances instead: the zone accepts a dropped
// file, the page accepts a pasted screenshot, and "Use webcam" opens a real
// getUserMedia capture (desktop browsers ignore `capture=`, so the phone path
// would quietly become a file picker there).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { SCAN_PHOTO_ACCEPT } from '@/api/scan'
import { CameraGlyph } from '@/components/discover/ScanBand'
import WebcamCapture from '@/components/scan/WebcamCapture'

interface CaptureZoneProps {
  /** Names the input for assistive tech: "Photo of your food" / "…the receipt". */
  inputLabel: string
  isDesktop: boolean
  disabled: boolean
  onFile: (file: File) => void
  /** The reassurance under the zone — mode-specific, and the backend's own words. */
  helper: string
}

export default function CaptureZone({ inputLabel, isDesktop, disabled, onFile, helper }: CaptureZoneProps) {
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [webcam, setWebcam] = useState(false)

  // Paste a screenshot straight onto the page — desktop only, and only while a
  // capture is actually being asked for.
  useEffect(() => {
    if (!isDesktop || disabled) return
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (file) {
        e.preventDefault()
        onFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [isDesktop, disabled, onFile])

  const take = (input: HTMLInputElement | null) => {
    if (disabled) return
    input?.click()
  }

  const handlePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    // Let the same photo be chosen again after a failure.
    e.target.value = ''
  }

  return (
    <>
      <div
        onDragOver={(e) => {
          if (disabled || !isDesktop) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (disabled || !isDesktop) return
          e.preventDefault()
          setDragging(false)
          const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
          if (file) onFile(file)
        }}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent-fill)' : 'var(--border)'}`,
          borderRadius: 22,
          background: dragging ? 'var(--chipbg)' : 'var(--surface)',
          padding: isDesktop ? '52px 18px' : '44px 18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--chipbg)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CameraGlyph size={28} />
        </div>

        {isDesktop ? (
          <>
            <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>Drop a photo here, paste, or</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" disabled={disabled} onClick={() => setWebcam(true)} style={{ ...zoneBtn, ...primaryBtn }}>
                Use webcam
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => take(libraryInput.current)}
                style={{ ...zoneBtn, ...secondaryBtn }}
              >
                Browse files
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => take(cameraInput.current)}
              style={{ ...zoneBtn, ...primaryBtn, padding: '12px 22px' }}
            >
              Open camera
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => take(libraryInput.current)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: disabled ? 'default' : 'pointer',
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: 700,
                color: 'var(--accent)',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              or choose a photo
            </button>
          </>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, textAlign: 'center', marginTop: 14 }}>
        {helper}
      </div>

      {/* The real controls. Off-screen rather than display:none so they stay
          reachable to assistive tech and to the tests that assert `capture`. */}
      <input
        ref={cameraInput}
        type="file"
        accept={SCAN_PHOTO_ACCEPT}
        capture="environment"
        aria-label={inputLabel}
        disabled={disabled}
        tabIndex={-1}
        onChange={handlePicked}
        style={visuallyHidden}
      />
      <input
        ref={libraryInput}
        type="file"
        accept={SCAN_PHOTO_ACCEPT}
        aria-label="Choose an image file"
        disabled={disabled}
        tabIndex={-1}
        onChange={handlePicked}
        style={visuallyHidden}
      />

      {webcam && (
        <WebcamCapture
          onClose={() => setWebcam(false)}
          onBrowseFiles={() => {
            setWebcam(false)
            take(libraryInput.current)
          }}
          onCapture={(file) => {
            setWebcam(false)
            onFile(file)
          }}
        />
      )}
    </>
  )
}

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}

const zoneBtn: CSSProperties = {
  border: 'none',
  borderRadius: 12,
  padding: '11px 20px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

const primaryBtn: CSSProperties = { background: 'var(--accent-fill)', color: 'var(--accent-ink)' }
const secondaryBtn: CSSProperties = { background: 'var(--tagbg)', color: 'var(--tagcol)' }
