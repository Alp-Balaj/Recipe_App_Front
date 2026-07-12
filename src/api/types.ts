// ─────────────────────────────────────────────────────────────────────────
// Wire shapes — a 1:1 mirror of the backend DTOs (Recipe_App_Back).
//
// FROZEN at checkpoint 02: additive-only, coordinated edits from here on
// (see CLAUDE.md "Frozen shared modules rule"). The lanes import these; do
// not rename or reshape a field without a reviewed change on master.
//
// The API serializes with the default ASP.NET web policy (camelCase property
// names) and a global JsonStringEnumConverter (enums as their PascalCase
// member names — "Easy", "Public", …). Guids and DateTimes arrive as strings.
// ─────────────────────────────────────────────────────────────────────────

/** RecipeApp.Domain.Enums.DifficultyLevel */
export type Difficulty = 'Easy' | 'Medium' | 'Hard'

/** RecipeApp.Domain.Enums.RecipeVisibility */
export type Visibility = 'Public' | 'Private' | 'FriendsOnly'

// ── Auth ──────────────────────────────────────────────────────────────────

/** AuthResponse — returned by BOTH POST /auth/register and POST /auth/login. */
export interface AuthResponse {
  token: string
  expiresAtUtc: string
  userId: string
  username: string
}

/** RegisterRequest — POST /auth/register. */
export interface RegisterRequest {
  username: string
  email: string
  password: string
}

/**
 * LoginRequest — POST /auth/login. ONE field matching either a username or an
 * email, NOT separate fields.
 */
export interface LoginRequest {
  usernameOrEmail: string
  password: string
}

/** GET /auth/me — the boot-time session validator for a persisted token. */
export interface MeResponse {
  userId: string
  username: string
}

// ── Recipes ───────────────────────────────────────────────────────────────

/** RecipeApp.Domain.ValueObjects.RecipeIngredient */
export interface RecipeIngredient {
  name: string
  quantity: number
  unit: string
}

/** RecipeApp.Domain.ValueObjects.RecipeStep — timerSeconds is null when unset. */
export interface RecipeStep {
  stepNumber: number
  description: string
  timerSeconds?: number | null
}

/** RecipeResponse — GET /recipes/{id}, items of GET /recipes, POST /recipes 201. */
export interface RecipeResponse {
  id: string
  title: string
  description: string
  prepTimeMinutes: number
  cookTimeMinutes: number
  totalTimeMinutes: number
  servings: number
  difficulty: Difficulty
  cuisineType?: string | null
  caloriesPerServing?: number | null
  imageUrl?: string | null
  visibility: Visibility
  createdAt: string
  updatedAt?: string | null
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  tags: string[]
  createdByUserId: string
}

/**
 * CreateRecipeRequest — POST /recipes. stepNumber IS part of each RecipeStep in
 * the request body (the backend validator requires stepNumber > 0); the create
 * form auto-assigns index + 1 rather than exposing it as a field (checkpoint 05).
 */
export interface CreateRecipeRequest {
  title: string
  description: string
  prepTimeMinutes: number
  cookTimeMinutes: number
  servings: number
  difficulty: Difficulty
  cuisineType?: string | null
  caloriesPerServing?: number | null
  imageUrl?: string | null
  visibility: Visibility
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  tags: string[]
}

/**
 * Query params for GET /recipes. tags is sent as repeated ?tags=a&tags=b
 * (match-ALL, case-SENSITIVE on the backend); cuisine is case-insensitive.
 * limit defaults to 20, is clamped to 50, and <= 0 → 400.
 */
export interface RecipeListQuery {
  cuisine?: string
  difficulty?: Difficulty
  tags?: string[]
  cursor?: string
  limit?: number
}

/** RecipeListResponse — base64url keyset cursor; nextCursor is null on the last page. */
export interface RecipeListResponse {
  items: RecipeResponse[]
  nextCursor?: string | null
}

// ── Error payloads ──────────────────────────────────────────────────────────

/**
 * ASP.NET ValidationProblem (400). `errors` is keyed by PascalCase property
 * paths ("Title", "Ingredients[0].Name") — the create form maps those to its
 * camelCase field names (checkpoint 05).
 */
export interface ValidationProblemResponse {
  type?: string
  title?: string
  status?: number
  errors: Record<string, string[]>
}

/** Conflict body (409) from POST /auth/register when the username/email is taken. */
export interface ConflictResponse {
  error: string
}
