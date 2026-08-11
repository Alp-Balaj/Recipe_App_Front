// ─────────────────────────────────────────────────────────────────────────
// The profile Cooked tab — the fourth tab beside Recipes / Saved / Activity
// (KAN-4, design D16).
//
// A tab rather than a seventh bottom-nav entry: the mobile bar is already full,
// and Cooked belongs with the other two collections a user keeps about
// themselves. It renders exactly what /cooked renders — one component, so the
// tab and the page cannot come to disagree about a row.
// ─────────────────────────────────────────────────────────────────────────

import { useNavigate } from 'react-router-dom'
import CookedDishList from '@/components/cooked/CookedDishList'

export default function ProfileCookedTab() {
  const navigate = useNavigate()

  return <CookedDishList onBrowse={() => navigate('/discover')} />
}
