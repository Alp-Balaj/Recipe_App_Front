// ─────────────────────────────────────────────────────────────────────────
// Shopping-list surface (/shopping-list) — week/shopping rework, Task 6.
//
// The list is a PROJECTION of a week now, not a table of rows, and that changes
// what this page is. It used to be a keyset-paged column of generated rows whose
// ticks a regenerate could throw away. It is one week's ingredients, computed per
// request, with ticks held in a mark overlay keyed by week + ingredient — so a
// tick survives every later edit to the plan, and there is nothing to generate.
//
// What that buys, and what this page therefore shows:
//  · one row per INGREDIENT, naming the dishes it serves (you buy flour once);
//  · a scope control — this week, or every week still owing something;
//  · a progress read for the visible scope, with its denominator ("1 of 3");
//  · ticked rows that DIM IN PLACE. Nothing rearranges unless asked, and asking
//    is "Hide bought (n)" — a list that reorders itself while you read it in a
//    shop is worse than one with a few grey lines in it;
//  · the orphan notice as a dismissible banner, never as ghost rows: the item
//    left your plan, you just want to know it went;
//  · while offline, the CACHE plus a banner. You are standing in a shop; a
//    slightly stale list beats an error page, and the ticks queue behind it.
//
// The paging is gone with the rows — no cursor, no "Load more", no "That's
// everything". A week's list is bounded by the plan that produced it.
//
// Delete is two verbs and the difference is not cosmetic: a Derived group is
// HIDDEN for the week (a suppression mark) because it will be recomputed from
// the plan on the next read, while a Manual row is DELETED because nothing would
// recreate it. Sending a suppression for a `manual:` key is a 400 server-side.
// The page reads `origin` to choose — never the key's shape.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { weekStartOf } from '@/api/mealPlans'
import type { ShoppingGroup, ShoppingScope, ShoppingWeek } from '@/api/shopping'
import { useShoppingMutations, useShoppingWeek } from '@/hooks/useShoppingWeek'
import BoughtSection from '@/components/shopping/BoughtSection'
import IngredientGroup from '@/components/shopping/IngredientGroup'
import ManualAddForm from '@/components/shopping/ManualAddForm'
import StateBlock from '@/components/ui/StateBlock'

const SCOPES: { value: ShoppingScope; label: string }[] = [
  { value: 'Week', label: 'This week' },
  { value: 'All', label: 'All' },
]

/** "Mon 27 Jul – Sun 2 Aug" — only needed when several weeks share the page. */
function weekHeading(weekStartIso: string): string {
  const start = new Date(weekStartIso)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const fmt = (date: Date) =>
    date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${fmt(start)} – ${fmt(end)}`
}

export default function ShoppingListPage() {
  const [scope, setScope] = useState<ShoppingScope>('Week')
  const [hideBought, setHideBought] = useState(false)
  /** The exact orphan set the reader has already dismissed — a new one banners again. */
  const [dismissedOrphans, setDismissedOrphans] = useState<string | null>(null)

  // This route has no week parameter, so "this week" means the current one. It is
  // also the week a manual row goes to under either scope: under 'All' there is no
  // single scoped week, and the week you are shopping for is this one.
  //
  // Deliberately NOT memoised on []. Pinning it at mount means a session left open
  // across Monday 00:00 UTC keeps asking for last week and files manual adds into
  // it — the same time-coupling that quietly broke the day-page tests. The call is
  // cheap and returns a stable string, so the query key still only changes when the
  // week actually does; no timer or interval is needed to notice.
  const currentWeek = weekStartOf(new Date())
  // scope 'All' IGNORES weekStart server-side, and the cache key says so by
  // holding null — the two scopes are genuinely different projections.
  const scopedWeek = scope === 'Week' ? currentWeek : null

  const { data, isLoading, isError } = useShoppingWeek(scopedWeek, scope)
  const { setPurchased, suppress, addItem, removeItem } = useShoppingMutations(scopedWeek, scope)

  const weeks = data?.weeks ?? []
  const purchased = weeks.reduce((sum, week) => sum + week.purchasedCount, 0)
  const total = weeks.reduce((sum, week) => sum + week.totalCount, 0)

  const orphans = data?.orphanedPurchasedNames ?? []
  const showOrphans = orphans.length > 0 && orphans.join('|') !== dismissedOrphans

  const visibleGroups = (week: ShoppingWeek) =>
    hideBought ? week.groups.filter((group) => !group.isPurchased) : week.groups
  const rendered = weeks.filter((week) => visibleGroups(week).length > 0)

  /**
   * Suppress a Derived group, delete a Manual one. The tick rides along on the
   * suppression because the mark is an explicit full set of both flags — dropping
   * it would untick something on its way out.
   */
  const onRemove = (weekStartDate: string, group: ShoppingGroup) => {
    if (group.origin === 'Manual') {
      // A Manual group without its row id can only be a server bug; a suppression
      // for its `manual:` key is a guaranteed 400, so send nothing at all.
      if (group.manualItemId) removeItem.mutate({ weekStartDate, manualItemId: group.manualItemId })
      return
    }
    suppress.mutate({ weekStartDate, key: group.key, isPurchased: group.isPurchased })
  }

  // Offline is "the fetch failed but we still hold a list". With nothing cached
  // there is nothing to be stale about, so that is a plain error instead.
  const offline = isError && data !== undefined

  return (
    <div className="scroll" style={pageStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>Shopping list</h1>
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 14px' }}>
        Everything this week's meals need, one row per ingredient.
      </div>

      <div style={controls}>
        <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Which weeks to show">
          {SCOPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              style={scope === value ? scopeTabOn : scopeTab}
            >
              {label}
            </button>
          ))}
        </div>
        {total > 0 && (
          // No aria-label here: on a generic role it is ARIA-prohibited, and where
          // it IS honoured it REPLACES the text — costing a screen-reader user the
          // number, which is the whole content. A visually-hidden prefix adds the
          // context instead, so this announces "Bought 1 of 3".
          <span style={progress}>
            <span style={srOnly}>Bought </span>
            {purchased} of {total}
          </span>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <ManualAddForm
          onAdd={(item) => addItem.mutateAsync({ ...item, weekStartDate: currentWeek })}
          isPending={addItem.isPending}
          isError={addItem.isError}
        />
      </div>

      {showOrphans && (
        <div style={banner}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700 }}>
              {orphans.length === 1
                ? "1 thing you'd already bought is no longer in your plan."
                : `${orphans.length} things you'd already bought are no longer in your plan.`}
            </span>{' '}
            <span style={{ color: 'var(--muted)' }}>{orphans.join(', ')}</span>
          </span>
          <button type="button" style={bannerButton} onClick={() => setDismissedOrphans(orphans.join('|'))}>
            Dismiss
          </button>
        </div>
      )}

      {offline && (
        <div style={banner}>
          <span>You're offline — your ticks will sync when you're back.</span>
        </div>
      )}

      {isLoading && <StateBlock title="Loading your list…" />}

      {!isLoading && isError && !offline && (
        <StateBlock title="Couldn't load your list" body="Check your connection and try again." />
      )}

      {!isLoading && !(isError && !offline) && total === 0 && (
        <StateBlock
          title="Nothing on your list yet."
          body="Plan some meals for this week, or add something of your own above."
        />
      )}

      {total > 0 && (
        <>
          <div style={{ marginBottom: 10 }}>
            <BoughtSection
              count={purchased}
              collapsed={hideBought}
              onToggle={() => setHideBought((collapsed) => !collapsed)}
            />
          </div>

          {/* Everything is bought AND hidden: without this the list area is simply
              blank, which reads as a broken page rather than a finished shop. */}
          {rendered.length === 0 && <StateBlock title="Everything on this list is bought." />}

          {rendered.map((week) => (
            <section key={week.weekStartDate} style={{ marginBottom: 14 }}>
              {/* One week needs no label — the scope control already said which. */}
              {scope === 'All' && (
                <h2 style={weekLabel}>
                  {weekHeading(week.weekStartDate)}
                  <span style={{ fontWeight: 600, color: 'var(--muted)' }}>
                    {' '}
                    · {week.purchasedCount} of {week.totalCount}
                  </span>
                </h2>
              )}
              <div style={listCard}>
                {visibleGroups(week).map((group, index) => (
                  <IngredientGroup
                    key={group.key}
                    group={group}
                    divided={index > 0}
                    onToggle={(isPurchased) =>
                      setPurchased.mutate({ weekStartDate: week.weekStartDate, key: group.key, isPurchased })
                    }
                    onRemove={() => onRemove(week.weekStartDate, group)}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

const pageStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 24px',
}

const controls: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 14,
}

const scopeTab: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 11,
  padding: '6px 12px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  background: 'var(--surface)',
  color: 'var(--muted)',
}

const scopeTabOn: CSSProperties = {
  ...scopeTab,
  border: '1px solid transparent',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}

// The number and its denominator, tabular so it doesn't jitter as you tick.
const progress: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
}

const listCard: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 20,
  padding: '4px 14px 10px',
}

const banner: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'var(--chipbg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '10px 12px',
  fontSize: 13,
  lineHeight: 1.45,
  marginBottom: 12,
  overflowWrap: 'anywhere',
}

const bannerButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '5px 11px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  background: 'var(--surface)',
}

// Same visually-hidden recipe as RecipeFormPage.shared.tsx's srOnlyInputStyle.
const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

const weekLabel: CSSProperties = {
  margin: '0 0 6px',
  fontSize: 12.5,
  fontWeight: 800,
  letterSpacing: '0.02em',
}
