// ─────────────────────────────────────────────────────────────────────────
// The tag chip picker (stream G, slice G1). Replaces the comma-separated text
// field that fed Recipe.Tags when tags were free text.
//
// Why a picker and not an autocompleting text field: tag FILTERING on
// GET /recipes is match-ALL and case-sensitive, so before the vocabulary was
// closed "one-pot", "One Pot" and "onepot" were three unrelated facets and
// every tag filter silently under-returned. A control that can only emit
// members is what makes the filter mean something — the constraint IS the
// feature here, which is the opposite of the ingredient name field one card
// above, where a brand-new value must always be enterable (decision D8).
//
// Grouped, because 39 chips in one undifferentiated wall would be a worse
// authoring experience than the field it replaces.
// ─────────────────────────────────────────────────────────────────────────

import type { RecipeTag } from '@/api/types'
import { MAX_TAGS, TAG_GROUPS, label } from '@/api/vocabulary'

interface TagPickerProps {
  selected: RecipeTag[]
  onChange: (tags: RecipeTag[]) => void
  error?: string
}

export function TagPicker({ selected, onChange, error }: TagPickerProps) {
  const atLimit = selected.length >= MAX_TAGS

  const toggle = (tag: RecipeTag) => {
    // Rebuilt in TAG_GROUPS order rather than appended, so the chips a recipe
    // carries always read in the same order as the picker — otherwise the
    // detail page would list them in click order, which looks arbitrary.
    const next = selected.includes(tag)
      ? selected.filter((t) => t !== tag)
      : [...selected, tag]
    onChange(TAG_GROUPS.flatMap((g) => g.tags).filter((t) => next.includes(t)))
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Tags</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {selected.length} / {MAX_TAGS}
        </span>
      </div>

      {TAG_GROUPS.map((group) => (
        <div key={group.label} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>{group.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {group.tags.map((tag) => {
              const isSelected = selected.includes(tag)
              // A chip past the limit is disabled rather than hidden: hiding it
              // would make the limit look like the vocabulary shrank.
              const disabled = !isSelected && atLimit
              return (
                <button
                  key={tag}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-label={label(tag)}
                  disabled={disabled}
                  onClick={() => toggle(tag)}
                  style={{
                    fontSize: 12.5,
                    fontWeight: isSelected ? 700 : 500,
                    padding: '6px 11px',
                    borderRadius: 999,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.4 : 1,
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    // --accent (#5e7a2b) rather than --accent-fill (#7f9a3f),
                    // which index.css otherwise reserves for solid fills. Its own
                    // note explains why: --accent-ink on --accent-fill lands near
                    // 3.1:1, and these chips are 12.5px. The deeper olive keeps
                    // the label above 4.5:1 at that size.
                    background: isSelected ? 'var(--accent)' : 'var(--chipbg)',
                    color: isSelected ? 'var(--accent-ink)' : 'var(--muted)',
                    transition: 'background 120ms ease, color 120ms ease',
                  }}
                >
                  {label(tag)}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {error && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--danger, #c0392b)', marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  )
}
