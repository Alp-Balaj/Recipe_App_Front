import { useState } from 'react'
import { RECIPES, type RecipeId } from '@/data/recipes'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import ChatTab from './ChatTab'
import LibraryTab from './LibraryTab'
import ProfileTab from './ProfileTab'
import RecipeDetail from './RecipeDetail'
import BottomNav from './BottomNav'
import Sidebar from './Sidebar'

export type Mode = 'light' | 'dark'
export type Tab = 'chat' | 'library' | 'profile'

export default function RecipeApp() {
  const [mode, setMode] = useState<Mode>('dark')
  const [tab, setTab] = useState<Tab>('chat')
  const [detail, setDetail] = useState<RecipeId | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
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
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const toggleMode = () => setMode((m) => (m === 'light' ? 'dark' : 'light'))

  // The active tab's content — reused in both the mobile frame and the
  // desktop conversation pane (they're just different positioning contexts).
  const tabContent = (
    <>
      {tab === 'chat' && (
        <ChatTab onOpenRecipe={setDetail} mode={mode} onToggleMode={toggleMode} />
      )}
      {tab === 'library' && (
        <LibraryTab onOpenRecipe={setDetail} saved={saved} savedCount={savedCount} />
      )}
      {tab === 'profile' && <ProfileTab mode={mode} onSetMode={setMode} />}
    </>
  )

  // ── Desktop (>=1024px): sidebar + conversation pane + recipe canvas ──
  if (isDesktop) {
    return (
      <div className="app-shell" data-mode={mode}>
        <div className="desktop-layout">
          {sidebarOpen && (
            <Sidebar
              tab={tab}
              onGoTo={goTo}
              mode={mode}
              onToggleMode={toggleMode}
              onCollapse={() => setSidebarOpen(false)}
            />
          )}

          <div className="desktop-main">
            {!sidebarOpen && (
              <button
                className="sidebar-reopen"
                onClick={() => setSidebarOpen(true)}
                title="Show sidebar"
                aria-label="Show sidebar"
              >
                »
              </button>
            )}

            <section className="conversation-pane">
              <div className="conversation-inner">{tabContent}</div>
            </section>

            {/* Recipe canvas — only mounted once a recipe is selected. */}
            {detail && (
              <section className="canvas-pane">
                <RecipeDetail
                  recipe={RECIPES[detail]}
                  saved={saved[detail]}
                  onClose={() => setDetail(null)}
                  onToggleSave={() => toggleSave(detail)}
                />
              </section>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Mobile (<768px full-bleed) & tablet (768–1023px centered column) ──
  return (
    <div className="app-shell" data-mode={mode}>
      {/* Responsive frame: full-bleed on mobile, centered column on tablet.
          Stays position:relative so the absolutely-positioned tabs / nav /
          detail overlay keep working unchanged. */}
      <div className="app-frame">
        {tabContent}

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

      <div className="app-hint">
        Recipe app · tap a card → recipe detail · theme toggle in Profile or Chat
      </div>
    </div>
  )
}
