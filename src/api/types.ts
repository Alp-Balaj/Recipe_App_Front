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

/**
 * RecipeApp.Domain.Enums.RecipeVisibility
 *
 * `FriendsOnly` means a MUTUAL follow (stream F, decision D6): the viewer follows
 * the author AND the author follows the viewer. A one-way follow in either
 * direction grants nothing. Before D6 the backend treated it as owner-only, so
 * anyone reading old code should not trust "friends" to have ever meant anything.
 */
export type Visibility = 'Public' | 'Private' | 'FriendsOnly'

// stream G (ingredient typing, decision D10) — SANCTIONED ADDITIVE EDIT to this
// frozen module, landing as its own reviewed commit per the rule.
//
// Four fields that were free-text strings on the wire become closed vocabularies.
// These unions are NOT additive in the way stream D's and stream E's edits were:
// `unit`, `cuisineType`, `tags` and the profile's `dietaryRestrictions` change
// TYPE, from `string` to a union. That is the point of the change — the compiler
// now rejects the "cups" / "Cups" / "cup" divergence the backend used to store —
// and it is why this commit is separate and reviewed rather than an in-lane edit.
//
// Each mirrors a C# enum by member name; the wire format is unchanged (the global
// JsonStringEnumConverter already sent PascalCase names for Difficulty and
// Visibility). Keep them in the SAME ORDER as the C# enums: the pickers render
// straight from these arrays, so the order is user-visible.

/** RecipeApp.Domain.Enums.UnitOfMeasure */
export type UnitOfMeasure =
  | 'Gram' | 'Kilogram' | 'Ounce' | 'Pound' | 'Millilitre' | 'Litre'
  | 'Teaspoon' | 'Tablespoon' | 'Cup' | 'FluidOunce' | 'Piece' | 'Clove'
  | 'Slice' | 'Can' | 'Package' | 'Bunch' | 'Pinch' | 'Dash' | 'Splash'
  | 'Handful' | 'ToTaste'

/** RecipeApp.Domain.Enums.UnitDimension — what a unit measures. */
export type UnitDimension = 'Mass' | 'Volume' | 'Count' | 'Imprecise'

/** RecipeApp.Domain.Enums.Cuisine */
export type Cuisine =
  | 'American' | 'British' | 'Caribbean' | 'Chinese' | 'EasternEuropean'
  | 'French' | 'German' | 'Greek' | 'Indian' | 'Italian' | 'Japanese'
  | 'Korean' | 'Mediterranean' | 'Mexican' | 'MiddleEastern' | 'NorthAfrican'
  | 'Nordic' | 'Portuguese' | 'Spanish' | 'Thai' | 'Turkish' | 'Vietnamese'
  | 'Other'

/** RecipeApp.Domain.Enums.RecipeTag — the curated tag vocabulary. */
export type RecipeTag =
  | 'Breakfast' | 'Brunch' | 'Lunch' | 'Dinner' | 'Appetizer' | 'SideDish'
  | 'Dessert' | 'Snack' | 'Drink' | 'Salad' | 'Soup' | 'Stew' | 'Sandwich'
  | 'Pasta' | 'Pizza' | 'Curry' | 'Bread' | 'Cake' | 'Baking' | 'Grilling'
  | 'Roasting' | 'Frying' | 'SlowCooker' | 'OnePot' | 'NoCook' | 'MealPrep'
  | 'Quick' | 'Budget' | 'Comfort' | 'KidFriendly' | 'PartyFood' | 'Holiday'
  | 'Leftovers' | 'Vegetarian' | 'Vegan' | 'HighProtein' | 'LowCalorie'
  | 'Spicy' | 'Healthy'

/** RecipeApp.Domain.Enums.DietaryRestriction */
export type DietaryRestriction =
  | 'Vegetarian' | 'Vegan' | 'Pescatarian' | 'GlutenFree' | 'DairyFree'
  | 'NutFree' | 'PeanutFree' | 'EggFree' | 'SoyFree' | 'ShellfishFree'
  | 'Halal' | 'Kosher' | 'LowCarb' | 'LowSodium'

// ── Auth ──────────────────────────────────────────────────────────────────

// stream D (governor) — SANCTIONED ADDITIVE EDIT to this frozen module: the
// backend now returns the caller's role on both auth responses so the SPA can
// gate the /admin surface without a second call. New optional-shaped field on
// existing interfaces; nothing renamed or reshaped.
/** RecipeApp.Domain.Enums.UserRole */
export type UserRole = 'User' | 'Admin'

/** AuthResponse — returned by BOTH POST /auth/register and POST /auth/login. */
export interface AuthResponse {
  token: string
  expiresAtUtc: string
  userId: string
  username: string
  /** stream D: present on every response since the governor landed. */
  role: UserRole
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
  /** stream D: DB-read role, authoritative over the (possibly stale) token claim. */
  role: UserRole
}

// ── Recipes ───────────────────────────────────────────────────────────────

/**
 * RecipeApp.Domain.ValueObjects.RecipeIngredient
 *
 * `name` stays a free-text string on purpose (decision D8, "resolve, don't
 * constrain"): a brand-new ingredient must always be enterable. Only `unit` is
 * constrained.
 */
export interface RecipeIngredient {
  name: string
  quantity: number
  unit: UnitOfMeasure
  /**
   * stream G slice G2 — the catalogue entry this line resolved to, or null.
   *
   * APPENDED and optional in shape, so every existing consumer and test
   * fixture keeps compiling; the backend always sends it. Null is a legal,
   * expected, permanent state, not a loading value: the resolver runs on
   * write, and per D8 a name it does not recognise saves anyway. Do not
   * render an unresolved line as an error.
   */
  ingredientId?: string | null
}

/**
 * RecipeApp.Domain.Enums.TemperatureUnit — stream J.
 *
 * Two members, and a step's temperature is stored in the unit it was WRITTEN in
 * rather than normalised to one scale: 350 °F is a number a reader recognises,
 * and 177 °C is the same oven wearing a disguise. Convert at display time.
 */
export type TemperatureUnit = 'Celsius' | 'Fahrenheit'

/** RecipeApp.Domain.ValueObjects.StepTemperature — whole degrees plus its scale. */
export interface StepTemperature {
  value: number
  unit: TemperatureUnit
}

/**
 * RecipeApp.Domain.ValueObjects.RecipeStep — SANCTIONED EDIT to this frozen
 * module, landing as its own reviewed commit per the rule (stream J).
 *
 * `timerSeconds` is GONE, not deprecated: decision D10 makes this a hard cutover
 * with no dual-read, the migration renames the key in the stored jsonb, and the
 * backend neither accepts nor emits the old name. A field kept "for safety" here
 * would be a field that is always undefined, which is worse than its absence —
 * it reads as data that might arrive.
 *
 * The three additions are all optional in shape. A step written before J has no
 * references and no temperature, and both of those are ordinary legal states
 * rather than missing values, so no consumer should treat either as an error.
 */
export interface RecipeStep {
  stepNumber: number
  description: string
  /**
   * How long the step takes, in whole seconds. Absorbs the old `timerSeconds`,
   * which claimed something narrower — an unattended wait worth setting a timer
   * for. Null means the step has no meaningful duration ("season to taste").
   */
  durationSeconds?: number | null
  /**
   * DECISION D16 — which of the recipe's own ingredient lines this step uses, as
   * ZERO-BASED indexes into the SAME recipe's `ingredients` array. Not catalogue
   * ids: `ingredientId` is nullable by design (D8), so it cannot address a line
   * the catalogue has never heard of, and a reference shape with a hole in it is
   * not a reference shape.
   *
   * The backend validators reject an out-of-range or repeated index on both the
   * create and update paths, so a stored recipe's indexes are always in range —
   * but a CLIENT holding an edited ingredient list must remap them itself before
   * sending, because deleting a line shifts every position after it.
   *
   * Absent or empty is the common case: "preheat the oven" consumes nothing.
   */
  ingredientIndexes?: number[]
  /** The temperature this step is carried out at, or null — which is most steps. */
  temperature?: StepTemperature | null
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
  /** null means "no particular cuisine", which is different from 'Other'. */
  cuisineType?: Cuisine | null
  caloriesPerServing?: number | null
  imageUrl?: string | null
  visibility: Visibility
  createdAt: string
  updatedAt?: string | null
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  tags: RecipeTag[]
  createdByUserId: string
  // stream E (AI recipe generator) — SANCTIONED ADDITIVE EDIT to this frozen module,
  // landing as its own reviewed commit per the rule. Both fields are APPENDED and optional
  // in shape, so every existing consumer and every test fixture keeps compiling; the
  // backend always sends them.
  /**
   * Decision D1: a generated recipe is user-owned and FLAGGED rather than system-owned, so
   * it behaves like any other recipe everywhere (owner-only edit/delete, feed, planner) and
   * the flag is the only thing that marks it. It is also why generating awards no rank.
   */
  isAiGenerated?: boolean
  /** The chat thread the recipe was generated from; null for hand-written recipes. */
  sourceConversationId?: string | null
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
  cuisineType?: Cuisine | null
  caloriesPerServing?: number | null
  imageUrl?: string | null
  visibility: Visibility
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  tags: RecipeTag[]
}

/**
 * Query params for GET /recipes. tags is sent as repeated ?tags=a&tags=b
 * (match-ALL); both cuisine and tags parse case-insensitively.
 * limit defaults to 20, is clamped to 50, and <= 0 → 400.
 *
 * stream G: a cuisine or tag the backend does not recognise is now a 400 rather
 * than a 200 with an empty list, so these two must come from the unions.
 */
export interface RecipeListQuery {
  cuisine?: Cuisine
  difficulty?: Difficulty
  tags?: RecipeTag[]
  cursor?: string
  limit?: number
}

/** RecipeListResponse — base64url keyset cursor; nextCursor is null on the last page. */
export interface RecipeListResponse {
  items: RecipeResponse[]
  nextCursor?: string | null
}

// ── AI lane envelopes ───────────────────────────────────────────────────────
// Additive, coordinated change (stream H, 2026-08-06) — its own reviewed commit
// per CLAUDE.md's frozen-shared-modules rule. Nothing existing is renamed or
// reshaped.
//
// These three shapes were each defined inside ONE feature module and are now
// returned by more than one endpoint, which is the trigger for promoting them
// here: AiBudget rode only the chat/generate responses until propose-week
// started returning it too, and the dietary verdict was declared privately
// inside RecipeInsights.tsx until propose-week and the generator began carrying
// it as well. Three private copies of a wire shape drift; this is the file whose
// whole job is not drifting from the backend DTOs.

/**
 * RecipeApp.Application.Chat.Dtos.AiBudgetResponse — the caller's remaining AI
 * allowance for the current UTC day. Rides every response that spends (or could
 * have spent) an AI call: chat turns, POST /recipes/generate, and — since stream
 * H — POST /meal-plans/propose-week. `resetsAtUtc` is next UTC midnight.
 */
export interface AiBudget {
  dailyCallLimit: number
  callsUsed: number
  callsRemaining: number
  dailyTokenLimit: number
  tokensUsed: number
  tokensRemaining: number
  resetsAtUtc: string
}

/** RecipeApp.Application.Recipes.Dtos.DietaryConflictResponse — one offending line. */
export interface DietaryConflict {
  ingredientName: string
  reason: string
}

/**
 * RecipeApp.Application.Recipes.Dtos.DietaryCheckResponse — one restriction's
 * verdict over a recipe's RESOLVED ingredients.
 *
 * Read the backend's DietaryRules before rendering this. `conflicts` empty means
 * nothing was FOUND, which is not the same as compliance: `uncheckableLines`
 * counts the ingredients that resolved to nothing and were therefore never
 * tested at all, and decision D8 guarantees such lines will always exist. A
 * client that shows an empty `conflicts` without showing that number is making a
 * safety claim this data cannot support. Nothing in the UI says "safe".
 */
export interface DietaryCheck {
  restriction: DietaryRestriction
  conflicts: DietaryConflict[]
  uncheckableLines: number
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
