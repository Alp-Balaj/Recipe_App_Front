// ─────────────────────────────────────────────────────────────────────────
// Comments (social-feed cp06) — the testimonial-row anatomy from the LIGHT
// inspiration shot: avatar + username + timestamp + body per row.
//
// CommentsPanel is the shared core (keyset-paged list newest-first, composer,
// edit/delete own, recipe-author delete per decision I6 — the backend
// enforces the asymmetry, we surface 403s legibly). It renders inline on
// desktop feed cards and the recipe detail page; CommentSheet wraps it in the
// bottom-sheet Modal for mobile. All mutations go through the ONE shared
// useSocialMutations hook, which bumps/drops the feed envelope's commentCount
// without a page refetch.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type CSSProperties } from 'react'
import { ApiError, ApiValidationError } from '@/api/client'
import { COMMENT_MAX_LENGTH, type CommentResponse } from '@/api/social'
import { useAuth } from '@/auth/AuthContext'
import { useAuthGate } from '@/auth/AuthGateContext'
import Avatar from '@/components/Avatar'
import Modal from '@/components/ui/Modal'
import { useComments } from '@/hooks/useComments'
import { useSocialMutations } from '@/hooks/useSocialMutations'
import { timeAgo } from '@/lib/time'

interface CommentsPanelProps {
  recipeId: string
  /** The recipe's author — may delete ANY comment on their recipe (I6). */
  recipeAuthorId: string
}

/** Translate a mutation error into a human sentence (I6 403s legible). */
function commentErrorMessage(error: unknown): string {
  if (error instanceof ApiValidationError) {
    const first = Object.values(error.errors)[0]?.[0]
    return first ?? 'That comment is not valid.'
  }
  if (error instanceof ApiError && error.status === 403) {
    return "You can't do that — only the comment's author (or the recipe's author, for deletes) can."
  }
  if (error instanceof ApiError && error.status === 404) {
    return 'That comment is gone.'
  }
  return 'Something went wrong. Try again.'
}

export function CommentsPanel({ recipeId, recipeAuthorId }: CommentsPanelProps) {
  const { user } = useAuth()
  const { requireAuth } = useAuthGate()
  const myId = user?.userId
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useComments(recipeId)
  const { addComment, updateComment, deleteComment } = useSocialMutations()

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Flatten pages, de-duping by id (a just-added comment can also arrive on a
  // later keyset page fetched afterwards).
  const comments = useMemo(() => {
    const seen = new Set<string>()
    const out: CommentResponse[] = []
    for (const page of data?.pages ?? []) {
      for (const c of page.items) {
        if (!seen.has(c.id)) {
          seen.add(c.id)
          out.push(c)
        }
      }
    }
    return out
  }, [data])

  const post = () => {
    // Guest access (D7): the list reads for guests; POSTING is gated. The gate
    // fires before .mutate so no optimistic/cache work runs for a guest.
    if (!requireAuth()) return
    const content = draft.trim()
    if (!content || addComment.isPending) return
    setError(null)
    addComment.mutate(
      { recipeId, content },
      {
        onSuccess: () => setDraft(''),
        onError: (err) => setError(commentErrorMessage(err)),
      },
    )
  }

  const remove = (commentId: string) => {
    setError(null)
    deleteComment.mutate(
      { commentId, recipeId },
      { onError: (err) => setError(commentErrorMessage(err)) },
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
      {/* Composer */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              post()
            }
          }}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          style={composerInput}
        />
        <button
          onClick={post}
          disabled={!draft.trim() || addComment.isPending}
          style={{
            ...postBtn,
            opacity: !draft.trim() || addComment.isPending ? 0.5 : 1,
            cursor: !draft.trim() || addComment.isPending ? 'default' : 'pointer',
          }}
        >
          {addComment.isPending ? 'Posting…' : 'Post'}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ fontSize: 12.5, color: '#d9534f', paddingBottom: 6 }}>
          {error}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div style={mutedNote}>Loading comments…</div>
      ) : isError ? (
        <div style={mutedNote}>
          Couldn't load comments.{' '}
          <button onClick={() => refetch()} style={linkBtn}>
            Try again
          </button>
        </div>
      ) : comments.length === 0 ? (
        <div style={mutedNote}>No comments yet — be the first.</div>
      ) : (
        <>
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              isOwn={c.authorId === myId}
              canDelete={c.authorId === myId || recipeAuthorId === myId}
              editing={editingId === c.id}
              onStartEdit={() => {
                setError(null)
                setEditingId(c.id)
              }}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(content) => {
                setError(null)
                updateComment.mutate(
                  { commentId: c.id, recipeId, content },
                  {
                    onSuccess: () => setEditingId(null),
                    onError: (err) => setError(commentErrorMessage(err)),
                  },
                )
              }}
              savePending={updateComment.isPending}
              onDelete={() => remove(c.id)}
            />
          ))}

          {hasNextPage && (
            <div style={{ paddingTop: 6 }}>
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                style={{ ...linkBtn, opacity: isFetchingNextPage ? 0.6 : 1 }}
              >
                {isFetchingNextPage ? 'Loading…' : 'View more comments'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** The bottom-sheet wrapper (mobile). Desktop surfaces render the panel inline. */
export function CommentSheet({
  recipeId,
  recipeAuthorId,
  onClose,
}: CommentsPanelProps & { onClose: () => void }) {
  return (
    <Modal variant="bottom" label="Comments" onClose={onClose}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 10,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>Comments</div>
        <button onClick={onClose} aria-label="Close comments" style={closeBtn}>
          ✕
        </button>
      </div>
      <CommentsPanel recipeId={recipeId} recipeAuthorId={recipeAuthorId} />
    </Modal>
  )
}

// ── One testimonial row ─────────────────────────────────────────────────────

function CommentRow({
  comment,
  isOwn,
  canDelete,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  savePending,
  onDelete,
}: {
  comment: CommentResponse
  isOwn: boolean
  canDelete: boolean
  editing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (content: string) => void
  savePending: boolean
  onDelete: () => void
}) {
  const [editDraft, setEditDraft] = useState(comment.content)

  return (
    <div style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border)' }}>
      <Avatar username={comment.authorUsername} seed={comment.authorId} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-0.01em' }}>
            {comment.authorUsername}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>
            {timeAgo(comment.createdAt)}
            {comment.updatedAt ? ' · edited' : ''}
          </span>
        </div>

        {editing ? (
          <div style={{ marginTop: 4 }}>
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              maxLength={COMMENT_MAX_LENGTH}
              aria-label="Edit comment"
              rows={2}
              style={editArea}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
              <button
                onClick={() => {
                  const content = editDraft.trim()
                  if (content) onSaveEdit(content)
                }}
                disabled={!editDraft.trim() || savePending}
                style={{ ...rowActionBtn, color: 'var(--accent)' }}
              >
                {savePending ? 'Saving…' : 'Save'}
              </button>
              <button onClick={onCancelEdit} style={rowActionBtn}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 2, overflowWrap: 'anywhere' }}>
              {comment.content}
            </div>
            {(isOwn || canDelete) && (
              <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                {isOwn && (
                  <button
                    onClick={() => {
                      setEditDraft(comment.content)
                      onStartEdit()
                    }}
                    aria-label={`Edit comment by ${comment.authorUsername}`}
                    style={rowActionBtn}
                  >
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={onDelete}
                    aria-label={`Delete comment by ${comment.authorUsername}`}
                    style={rowActionBtn}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const composerInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13.5,
  fontFamily: 'inherit',
  padding: '9px 12px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--inputbg)',
  color: 'var(--text)',
  outline: 'none',
}

const postBtn: CSSProperties = {
  flexShrink: 0,
  border: 'none',
  borderRadius: 11,
  padding: '9px 14px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}

const mutedNote: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  padding: '10px 0',
}

const linkBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
  padding: 0,
}

const rowActionBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
  padding: 0,
}

const editArea: CSSProperties = {
  width: '100%',
  fontSize: 13.5,
  fontFamily: 'inherit',
  lineHeight: 1.5,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--inputbg)',
  color: 'var(--text)',
  outline: 'none',
  resize: 'vertical',
}

const closeBtn: CSSProperties = {
  border: 'none',
  background: 'var(--surface2)',
  color: 'var(--text)',
  width: 30,
  height: 30,
  borderRadius: '50%',
  cursor: 'pointer',
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
