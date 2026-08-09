import type { CSSProperties } from 'react'
import type { RecipeResponse } from '@/api/types'
import RecipeCard from '@/components/RecipeCard'
import { useOpenRecipe } from '@/components/recipeCanvas'
import { SearchIcon } from './chatIcons'

/**
 * A recipe suggestion inside an assistant message — the shared RecipeCard in its
 * compact "suggestion" variant, opening the real /recipes/:id detail on tap.
 * (Consolidation: this used to be a third hand-rolled card with its own gradient
 * palette + raw-minutes formatting; it now reuses the one card.)
 *
 * Opens through useOpenRecipe so the chat thread stays behind the canvas — a
 * plain navigate() would swap the pane to Discover mid-conversation.
 *
 * The eyebrow and rail are the Library half of the mode distinction. Everything
 * this tab shows already EXISTS — the assistant may only point at real rows —
 * while the Create tab's results are invented. Those two kinds of card now sit
 * one tab apart instead of one scroll apart, so each says which it is on its
 * own face rather than relying on the reader remembering where they are.
 */
export default function SuggestionCard({ recipe }: { recipe: RecipeResponse }) {
  const openRecipe = useOpenRecipe()
  return (
    <div style={railStyle}>
      <span style={eyebrowStyle}>
        <SearchIcon size={10} />
        In your library
      </span>
      <RecipeCard recipe={recipe} variant="suggestion" onOpen={() => openRecipe(recipe.id)} />
    </div>
  )
}

// A bracket around the card rather than a border on it: the card already owns a
// border, and two nested outlines read as a mistake.
const railStyle: CSSProperties = {
  borderLeft: '3px solid var(--accent)',
  borderRadius: '3px 0 0 3px',
  paddingLeft: 9,
  marginBottom: 10,
}

const eyebrowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  marginBottom: 5,
}
