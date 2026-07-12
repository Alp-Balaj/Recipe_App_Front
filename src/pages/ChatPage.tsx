import { useNavigate, useOutletContext } from 'react-router-dom'
import ChatTab from '@/components/ChatTab'
import type { ThemeContextValue } from '@/components/ThemeRoot'

/** Static teaser until checkpoint 07 replaces it with the real thread. */
export default function ChatPage() {
  const navigate = useNavigate()
  const { mode, toggleMode } = useOutletContext<ThemeContextValue>()

  return (
    <ChatTab
      onOpenRecipe={(id) => navigate(`/recipes/${id}`)}
      mode={mode}
      onToggleMode={toggleMode}
    />
  )
}
