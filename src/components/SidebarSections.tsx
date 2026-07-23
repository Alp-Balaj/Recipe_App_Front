import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate, useMatch } from 'react-router-dom'
import { queryKeys } from '@/api/queryKeys'
import { useAuth } from '@/auth/AuthContext'
import { useAuthGate } from '@/auth/AuthGateContext'
import { useBackdropPath, useOpenRecipe } from '@/components/recipeCanvas'
import { useInfiniteRecipes } from '@/hooks/useInfiniteRecipes'
import { useLocalPref } from '@/hooks/useLocalPref'
import { flattenConversations, useConversations } from './chat/useConversations'

/**
 * The two collapsible sidebar sections (ChatGPT pattern): "Recipes" lists the
 * caller's own recipes, "Chats" lists their conversations — both newest-first.
 *
 * Collapsed by default and persisted per device (`useLocalPref`). The data
 * hooks live in the *body* components, which only mount while a section is
 * open, so a collapsed section costs no request. Recipe rows reuse the paged
 * GET /recipes + client-side owner filter that MyRecipesPage already uses (same
 * query key → one shared cache); chat rows reuse lane C's `useConversations`.
 */

/** Rows shown before "Show more"; matches the design's short list. */
const INITIAL_ROWS = 5

/** Page size for the recipe fetch — same client-side-filter caveat as MyRecipesPage. */
const RECIPE_PAGE_SIZE = 50

export default function SidebarSections() {
  const [recipesOpen, setRecipesOpen] = useLocalPref('sidebar.recipes', false)
  const [chatsOpen, setChatsOpen] = useLocalPref('sidebar.chats', false)
  const { isGuest, requireAuth } = useAuthGate()

  // Guest access (D5): both sections list ACCOUNT data (own recipes, own
  // chats) — the headers stay visible but expanding is gated on tap, and a
  // persisted open state never mounts a body (whose queries would 401).
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 14 }}>
      <SectionHeader
        title="Recipes"
        open={!isGuest && recipesOpen}
        onToggle={() => {
          if (!requireAuth()) return
          setRecipesOpen(!recipesOpen)
        }}
      />
      {!isGuest && recipesOpen && <RecipesBody />}

      <SectionHeader
        title="Chats"
        open={!isGuest && chatsOpen}
        onToggle={() => {
          if (!requireAuth()) return
          setChatsOpen(!chatsOpen)
        }}
      />
      {!isGuest && chatsOpen && <ChatsBody />}
    </div>
  )
}

// ── Section chrome ──────────────────────────────────────────────────────────

function SectionHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="sidebar-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        width: '100%',
        cursor: 'pointer',
        border: 'none',
        background: 'transparent',
        borderRadius: 11,
        padding: '9px 13px',
        marginTop: 8,
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: '-0.005em',
        color: 'var(--text)',
        textAlign: 'left',
      }}
    >
      {title}
      <Chevron open={open} />
    </button>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      style={{
        color: 'var(--muted)',
        transform: open ? 'rotate(90deg)' : 'none',
        transition: 'transform 0.18s',
      }}
    >
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** One list row — a truncating text button, amber-tinted when it's the open page. */
function SectionRow({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-current={active ? 'page' : undefined}
      className="sidebar-row"
      style={{
        display: 'block',
        width: '100%',
        cursor: 'pointer',
        border: 'none',
        borderRadius: 11,
        padding: '8px 13px',
        fontFamily: 'inherit',
        fontSize: 13.5,
        fontWeight: active ? 700 : 500,
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transition: 'background 0.15s, color 0.15s',
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text)',
      }}
    >
      {label}
    </button>
  )
}

/** The muted full-width "Show more" pill under a truncated list. */
function ShowMore({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="sidebar-row"
      style={{
        width: '100%',
        cursor: disabled ? 'default' : 'pointer',
        border: 'none',
        borderRadius: 11,
        padding: '8px 13px',
        marginTop: 2,
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'left',
        background: 'var(--surface2)',
        color: 'var(--muted)',
      }}
    >
      {label}
    </button>
  )
}

/** Loading / empty / error filler at row scale. */
function SectionNote({ children }: { children: ReactNode }) {
  return <div style={noteStyle}>{children}</div>
}

const noteStyle: CSSProperties = {
  padding: '7px 13px',
  fontSize: 12.5,
  color: 'var(--muted)',
}

// ── Recipes ─────────────────────────────────────────────────────────────────

function RecipesBody() {
  const openRecipe = useOpenRecipe()
  const { user } = useAuth()
  const detailMatch = useMatch('/recipes/:id')
  const openRecipeId = detailMatch?.params.id
  const [expanded, setExpanded] = useState(false)

  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteRecipes({
    queryKey: queryKeys.recipes.mine(),
    pageSize: RECIPE_PAGE_SIZE,
  })

  // Newest first. GET /recipes has no owner filter yet, so we filter on
  // createdByUserId client-side exactly like MyRecipesPage does.
  const mine = useMemo(() => {
    const all = (data?.pages ?? []).flatMap((p) => p.items)
    const owned = user?.userId ? all.filter((r) => r.createdByUserId === user.userId) : []
    return owned.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }, [data, user?.userId])

  const visible = expanded ? mine : mine.slice(0, INITIAL_ROWS)
  const hasMore = mine.length > visible.length || hasNextPage

  if (isLoading) return <SectionNote>Loading…</SectionNote>
  if (isError) return <SectionNote>Couldn't load your recipes.</SectionNote>
  if (mine.length === 0) return <SectionNote>No recipes yet.</SectionNote>

  return (
    <>
      {visible.map((r) => (
        <SectionRow
          key={r.id}
          label={r.title}
          active={r.id === openRecipeId}
          onClick={() => openRecipe(r.id)}
        />
      ))}
      {hasMore && (
        <ShowMore
          label={isFetchingNextPage ? 'Loading…' : 'Show more'}
          disabled={isFetchingNextPage}
          onClick={() => {
            if (!expanded) setExpanded(true)
            else if (hasNextPage) fetchNextPage()
          }}
        />
      )}
    </>
  )
}

// ── Chats ───────────────────────────────────────────────────────────────────

function ChatsBody() {
  const navigate = useNavigate()
  // The backdrop, not the raw URL: a recipe canvas opened FROM a thread must
  // leave that thread's row highlighted.
  const pathname = useBackdropPath()
  const [expanded, setExpanded] = useState(false)

  const list = useConversations()
  // Already ordered UpdatedAt DESC by the backend — newest-active first.
  const conversations = flattenConversations(list.data?.pages)

  const activeId = pathname.startsWith('/chat/') ? pathname.slice('/chat/'.length) : undefined
  const visible = expanded ? conversations : conversations.slice(0, INITIAL_ROWS)
  const hasMore = conversations.length > visible.length || list.hasNextPage

  if (list.isLoading) return <SectionNote>Loading…</SectionNote>
  if (list.isError) return <SectionNote>Couldn't load your chats.</SectionNote>
  if (conversations.length === 0) return <SectionNote>No chats yet.</SectionNote>

  return (
    <>
      {visible.map((c) => (
        <SectionRow
          key={c.id}
          label={c.title}
          active={c.id === activeId}
          onClick={() => navigate(`/chat/${c.id}`)}
        />
      ))}
      {hasMore && (
        <ShowMore
          label={list.isFetchingNextPage ? 'Loading…' : 'Show more'}
          disabled={list.isFetchingNextPage}
          onClick={() => {
            if (!expanded) setExpanded(true)
            else if (list.hasNextPage) list.fetchNextPage()
          }}
        />
      )}
    </>
  )
}
