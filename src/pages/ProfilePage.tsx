import { useOutletContext } from 'react-router-dom'
import ProfileTab from '@/components/ProfileTab'
import type { ThemeContextValue } from '@/components/ThemeRoot'

export default function ProfilePage() {
  const { mode, setMode } = useOutletContext<ThemeContextValue>()
  return <ProfileTab mode={mode} onSetMode={setMode} />
}
