// week/shopping rework, Task 9 — /plan/week is the Plan tab's static landing
// path. The nav needs a fixed URL, but "the current week" moves every Monday,
// so this page resolves today's week and redirects to the dated
// /plan/week/:start route. That's what lets navItems.ts point the Plan tab at
// a path that never changes, without router.tsx's existing routes changing.
import { Navigate } from 'react-router-dom'
import { planWeekPath, todayPlanDate } from '@/lib/planDates'

export default function PlanWeekIndex() {
  return <Navigate to={planWeekPath(todayPlanDate())} replace />
}
