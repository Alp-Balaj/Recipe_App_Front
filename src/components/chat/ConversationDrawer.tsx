import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { useChatApi } from './ChatApiContext'
import { flattenConversations, useConversations } from './useConversations'
import StateBlock from '@/components/ui/StateBlock'

/**
 * A slide-in panel listing the caller's conversations (chat-ai v3). Toggled from
 * the ChatPage header on every breakpoint (the chat column is narrow, so a
 * drawer beats a permanent rail and needs no shell/layout change). Supports:
 * new chat, switch (deep-link /chat/:id), inline rename, delete-with-confirm.
 * Invented in the amber idiom — this surface isn't in the redesign.
 */
export default function ConversationDrawer({
  open,
  onClose,
  activeConversationId,
}: {
  open: boolean
  onClose: () => void
  activeConversationId?: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const api = useChatApi()
  const list = useConversations()

  // Row-local UI state (only one row edits/confirms at a time).
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const conversations = flattenConversations(list.data?.pages)

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.renameConversation(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations() })
      setRenamingId(null)
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteConversation(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations() })
      queryClient.removeQueries({ queryKey: queryKeys.chat.conversationMessages(id) })
      setConfirmingId(null)
      // If we deleted the thread we're viewing, fall back to the new-chat surface.
      if (id === activeConversationId) navigate('/chat')
    },
  })

  function openConversation(id: string) {
    navigate(`/chat/${id}`)
    onClose()
  }

  function startRename(id: string, currentTitle: string) {
    setConfirmingId(null)
    setRenamingId(id)
    setRenameDraft(currentTitle)
  }

  function commitRename(id: string) {
    const title = renameDraft.trim()
    if (!title) return setRenamingId(null)
    rename.mutate({ id, title })
  }

  if (!open) return null

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        aria-hidden
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 40 }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Conversations"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 'min(320px, 84%)',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          boxShadow: 'var(--cardsh)',
          zIndex: 41,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 16px 12px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>Conversations</div>
          <button
            onClick={onClose}
            aria-label="Close conversations"
            style={iconButtonStyle}
          >
            ✕
          </button>
        </div>

        {/* New chat */}
        <div style={{ padding: '12px 16px' }}>
          <button
            onClick={() => {
              navigate('/chat')
              onClose()
            }}
            style={{
              width: '100%',
              cursor: 'pointer',
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              border: 'none',
              borderRadius: 12,
              padding: '11px 14px',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >
            + New chat
          </button>
        </div>

        {/* List */}
        <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 10px 16px' }}>
          {list.isLoading && <StateBlock title="Loading…" />}
          {list.isSuccess && conversations.length === 0 && (
            <StateBlock title="No conversations yet" body="Start one to see it here." />
          )}

          {conversations.map((c) => {
            const isActive = c.id === activeConversationId
            const isRenaming = c.id === renamingId
            const isConfirming = c.id === confirmingId
            return (
              <div
                key={c.id}
                style={{
                  borderRadius: 12,
                  padding: '9px 10px',
                  marginBottom: 2,
                  background: isActive ? 'var(--surface2)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(c.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onBlur={() => commitRename(c.id)}
                    aria-label="Conversation title"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: 'var(--inputbg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      fontSize: 13.5,
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <button
                    onClick={() => openConversation(c.id)}
                    title={c.title}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      fontSize: 13.5,
                      fontWeight: isActive ? 700 : 500,
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.title}
                  </button>
                )}

                {!isRenaming && !isConfirming && (
                  <>
                    <button
                      onClick={() => startRename(c.id, c.title)}
                      aria-label={`Rename ${c.title}`}
                      style={iconButtonStyle}
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(null)
                        setConfirmingId(c.id)
                      }}
                      aria-label={`Delete ${c.title}`}
                      style={iconButtonStyle}
                    >
                      🗑
                    </button>
                  </>
                )}

                {isConfirming && (
                  <>
                    <button
                      onClick={() => remove.mutate(c.id)}
                      disabled={remove.isPending}
                      aria-label={`Confirm delete ${c.title}`}
                      style={{ ...pillButtonStyle, color: 'var(--danger, #d4483b)' }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      aria-label="Cancel delete"
                      style={pillButtonStyle}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )
          })}

          {list.hasNextPage && (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <button
                onClick={() => list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
                style={{ ...pillButtonStyle, padding: '7px 14px' }}
              >
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const iconButtonStyle: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  width: 28,
  height: 28,
  borderRadius: 8,
  background: 'transparent',
  border: 'none',
  color: 'var(--muted)',
  fontSize: 14,
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const pillButtonStyle: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '5px 10px',
  fontSize: 12.5,
  color: 'var(--muted)',
  fontFamily: 'inherit',
}
