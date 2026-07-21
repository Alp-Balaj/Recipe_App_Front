// ─────────────────────────────────────────────────────────────────────────
// The profile Activity tab (design 3i). No activity endpoint exists, so this
// is DERIVED honestly from real data: the caller's own recipes become a
// "Published «recipe»" timeline, newest first, with relative timestamps. It
// shares the recipes.mine() query with the Recipes tab (no extra fetch).
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { queryKeys } from '@/api/queryKeys'
import { useAuth } from '@/auth/AuthContext'
import StateBlock from '@/components/ui/StateBlock'
import { useOpenRecipe } from '@/components/recipeCanvas'
import { useInfiniteRecipes } from '@/hooks/useInfiniteRecipes'
import { formatRelativeTime } from '@/lib/relativeTime'

interface ActivityItem {
  id: string
  target: string
  createdAt: string
}

export default function ProfileActivityTab() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const openRecipe = useOpenRecipe()
  const userId = user?.userId

  const { data, isLoading, isError, refetch } = useInfiniteRecipes({
    queryKey: queryKeys.recipes.mine(),
    pageSize: 50,
  })

  const items = useMemo<ActivityItem[]>(() => {
    const all = (data?.pages ?? []).flatMap((p) => p.items)
    const mine = userId ? all.filter((r) => r.createdByUserId === userId) : []
    return mine
      .map((r) => ({ id: r.id, target: r.title, createdAt: r.createdAt }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [data, userId])

  if (isLoading) return <StateBlock title="Loading activity…" />
  if (isError) {
    return <StateBlock title="Couldn't load your activity." action={{ label: 'Retry', onClick: () => refetch() }} />
  }
  if (items.length === 0) {
    return (
      <StateBlock
        title="No activity yet"
        body="Publishing recipes will build your timeline here."
        action={{ label: 'Create a recipe', onClick: () => navigate('/recipes/new') }}
      />
    )
  }

  return (
    <div>
      {items.map((a) => (
        <button key={a.id} onClick={() => openRecipe(a.id)} style={row}>
          <span style={iconTile}>▦</span>
          <span style={{ flex: 1, minWidth: 0, textAlign: 'left', paddingTop: 1 }}>
            <span style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.4 }}>
              Published <span style={{ fontWeight: 700, color: 'var(--text)' }}>{a.target}</span>
            </span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
              {formatRelativeTime(a.createdAt)}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

const row: CSSProperties = {
  display: 'flex',
  gap: 13,
  alignItems: 'flex-start',
  width: '100%',
  padding: '12px 2px',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--hair)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const iconTile: CSSProperties = {
  width: 36,
  height: 36,
  flexShrink: 0,
  borderRadius: 11,
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 15,
}
