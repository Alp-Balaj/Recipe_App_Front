// ─────────────────────────────────────────────────────────────────────────
// Desktop "Use webcam" (Scan redesign, step 1 — desktop only).
//
// On a phone the capture mechanism is the file input's `capture="environment"`,
// which opens the rear camera directly. Desktop browsers ignore that attribute
// entirely — the same button would silently open a file picker, so a button
// labelled "Use webcam" has to actually be one. getUserMedia → a frame drawn
// onto a canvas → a JPEG File, handed to exactly the same submit path the file
// input feeds. Nothing about the request changes; only where the bytes come
// from.
//
// The photo is never stored anywhere: the stream is stopped on close and the
// File is discarded once the scan responds (backend decision D19 — the scan
// itself persists nothing).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Modal from '@/components/ui/Modal'

interface WebcamCaptureProps {
  onCapture: (file: File) => void
  onClose: () => void
  /** The fallback when there is no camera to open — "Browse files" instead. */
  onBrowseFiles: () => void
}

export default function WebcamCapture({ onCapture, onClose, onBrowseFiles }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function open() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser has no camera access. Choose a photo instead.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        // The user may have closed the dialog while the permission prompt was
        // up — stop the stream rather than leaving the camera light on.
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch {
        if (!cancelled) setError('We could not open the camera. Check the permission, or choose a photo instead.')
      }
    }

    void open()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  function take() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('That frame could not be read. Try again, or choose a photo instead.')
          return
        }
        onCapture(new File([blob], 'webcam.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <Modal onClose={onClose} label="Use webcam" variant="center">
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--cardsh)',
          borderRadius: 20,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 10 }}>Use webcam</div>

        {error ? (
          <div role="alert" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 14 }}>
            {error}
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: '100%',
              aspectRatio: '4 / 3',
              objectFit: 'cover',
              borderRadius: 14,
              background: 'var(--surface2)',
              marginBottom: 14,
              display: 'block',
            }}
          />
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          {error ? (
            <button type="button" onClick={onBrowseFiles} style={{ ...actionBtn, ...primary }}>
              Browse files
            </button>
          ) : (
            <button type="button" onClick={take} disabled={!ready} style={{ ...actionBtn, ...primary, opacity: ready ? 1 : 0.55 }}>
              Take photo
            </button>
          )}
          <button type="button" onClick={onClose} style={{ ...actionBtn, ...secondary }}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

const actionBtn: CSSProperties = {
  flex: 1,
  border: 'none',
  borderRadius: 12,
  padding: '11px 18px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

const primary: CSSProperties = { background: 'var(--accent-fill)', color: 'var(--accent-ink)' }
const secondary: CSSProperties = { background: 'var(--tagbg)', color: 'var(--tagcol)' }
