import { useState } from 'react'
import { RECIPES, type RecipeId } from '@/data/recipes'
import ChatTab from './ChatTab'
import LibraryTab from './LibraryTab'
import ProfileTab from './ProfileTab'
import RecipeDetail from './RecipeDetail'
import BottomNav from './BottomNav'

export type Mode = 'light' | 'dark'
export type Tab = 'chat' | 'library' | 'profile'

export default function RecipeApp() {
  const [mode, setMode] = useState<Mode>('dark')
  const [tab, setTab] = useState<Tab>('chat')
  const [detail, setDetail] = useState<RecipeId | null>(null)
  const [saved, setSaved] = useState<Record<RecipeId, boolean>>({
    ramen: true,
    lentil: true,
    shakshuka: false,
  })

  const toggleSave = (id: RecipeId) => setSaved((s) => ({ ...s, [id]: !s[id] }))

  const goTo = (newTab: Tab) => {
    setTab(newTab)
    setDetail(null)
  }

  const savedCount = Object.values(saved).filter(Boolean).length

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#d7dacf',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: '36px 16px',
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
      }}
    >
      {/* Phone frame */}
      <div
        data-mode={mode}
        style={{
          position: 'relative',
          width: 390,
          height: 812,
          borderRadius: 42,
          background: 'var(--bg)',
          boxShadow: '0 30px 70px -22px rgba(0,0,0,.5)',
          overflow: 'hidden',
          color: 'var(--text)',
          border: '8px solid #0c0e0c',
          flexShrink: 0,
        }}
      >
        {tab === 'chat' && (
          <ChatTab
            onOpenRecipe={setDetail}
            mode={mode}
            onToggleMode={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
          />
        )}
        {tab === 'library' && (
          <LibraryTab
            onOpenRecipe={setDetail}
            saved={saved}
            savedCount={savedCount}
          />
        )}
        {tab === 'profile' && (
          <ProfileTab mode={mode} onSetMode={setMode} />
        )}

        <BottomNav tab={tab} onGoTo={goTo} />

        {detail && (
          <RecipeDetail
            recipe={RECIPES[detail]}
            saved={saved[detail]}
            onClose={() => setDetail(null)}
            onToggleSave={() => toggleSave(detail)}
          />
        )}
      </div>

      <div style={{ fontSize: 12, color: '#7e8278' }}>
        Recipe app · tap a card → recipe detail · theme toggle in Profile or Chat
      </div>
    </div>
  )
}
