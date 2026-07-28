// ─────────────────────────────────────────────────────────────────────────
// Shopping-list surface (/shopping-list) — meal-planning-ui plan, Task 4 shell.
//
// Header plus an empty-state block for now; Task 7 fills in the real list
// (keyset paging, tick / add / delete) and Task 8 adds generate-from-plan.
// Reachable by URL only until Task 9 adds the nav entry.
// ─────────────────────────────────────────────────────────────────────────

import StateBlock from '@/components/ui/StateBlock'

const pageStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 24px',
}

export default function ShoppingListPage() {
  return (
    <div className="scroll" style={pageStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>Shopping list</h1>
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 18px' }}>
        Everything you still need to buy, in one place.
      </div>

      <StateBlock
        title="Nothing on the list"
        body="Add items by hand, or generate them from a week's meal plan."
      />
    </div>
  )
}
