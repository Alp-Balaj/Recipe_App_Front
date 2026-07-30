// Create-recipe page (/recipes/new) — checkpoint 05, lane B.
// Renders the shared RecipeForm in create mode; on a successful POST it seeds
// the caches (via useCreateRecipe) and navigates to the new recipe's detail.
import { useNavigate } from 'react-router-dom'
import { RecipeForm, emptyRecipeDefaults } from './RecipeFormPage.shared'
import { useCreateRecipe } from '@/hooks/useRecipeMutations'
import { useAuth } from '@/auth/AuthContext'
import { useUserProfile } from '@/hooks/useUserProfile'

export default function RecipeFormPage() {
  const navigate = useNavigate()
  const createRecipe = useCreateRecipe()
  // Honour the caller's "default visibility" account setting. It has been
  // stored and editable since the account-settings work while this form
  // hardcoded Public, so choosing Private-by-default silently did nothing.
  // The profile is usually already cached (/profile mounts it); until it
  // arrives the form falls back to the same Public it always used.
  const { user } = useAuth()
  const { data: profile } = useUserProfile(user?.userId)

  return (
    <div
      className="scroll"
      style={{
        position: 'absolute',
        inset: 0,
        bottom: 'var(--nav-h, 74px)',
        overflowY: 'auto',
        padding: '54px 18px 24px',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>New recipe</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, marginBottom: 18 }}>
        Share what you're cooking
      </div>

      <RecipeForm
        defaultValues={emptyRecipeDefaults}
        applyDefaultVisibility={profile?.defaultRecipeVisibility}
        submitLabel="Publish recipe"
        pendingLabel="Publishing…"
        submit={(body) => createRecipe.mutateAsync(body)}
        onSuccess={(recipe) => navigate(`/recipes/${recipe.id}`)}
      />
    </div>
  )
}
