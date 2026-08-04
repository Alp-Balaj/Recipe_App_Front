// ─────────────────────────────────────────────────────────────────────────
// The typed vocabularies as the UI needs them: ordered option lists and the
// label for each member (stream G, decision D10).
//
// A new module rather than an addition to the frozen `@/api/types`, which
// carries wire SHAPES only. These are presentation: the label "fl oz" is not
// part of any contract, and changing it must not look like a wire change.
//
// Every list is ordered to match its C# enum, and the labels are the SPA's own
// (the backend has an equivalent in RecipeApp.Domain.Services.Vocabulary for
// AI prompts). What the two must agree on is the member names — the unions in
// types.ts — never the wording.
// ─────────────────────────────────────────────────────────────────────────

import type {
  Cuisine,
  DietaryRestriction,
  RecipeTag,
  UnitDimension,
  UnitOfMeasure,
} from '@/api/types'

// ── Units ─────────────────────────────────────────────────────────────────

interface UnitMeta {
  /** How the unit is written next to a number: "500 g", "2 cups". */
  readonly label: string
  readonly dimension: UnitDimension
  /** Word-shaped units take an "s" above 1; symbols never do. */
  readonly pluralises: boolean
}

/**
 * Mirrors Units.cs — dimension and written form. The SPA does not need the
 * conversion factors: every total the shopping list shows is summed on the
 * SERVER and arrives pre-rendered, so there is no arithmetic to duplicate here
 * (and therefore no second copy of the 240 ml cup convention to drift).
 */
export const UNIT_META: Readonly<Record<UnitOfMeasure, UnitMeta>> = {
  Gram: { label: 'g', dimension: 'Mass', pluralises: false },
  Kilogram: { label: 'kg', dimension: 'Mass', pluralises: false },
  Ounce: { label: 'oz', dimension: 'Mass', pluralises: false },
  Pound: { label: 'lb', dimension: 'Mass', pluralises: false },

  Millilitre: { label: 'ml', dimension: 'Volume', pluralises: false },
  Litre: { label: 'l', dimension: 'Volume', pluralises: false },
  Teaspoon: { label: 'tsp', dimension: 'Volume', pluralises: false },
  Tablespoon: { label: 'tbsp', dimension: 'Volume', pluralises: false },
  Cup: { label: 'cup', dimension: 'Volume', pluralises: true },
  FluidOunce: { label: 'fl oz', dimension: 'Volume', pluralises: false },

  Piece: { label: 'pc', dimension: 'Count', pluralises: true },
  Clove: { label: 'clove', dimension: 'Count', pluralises: true },
  Slice: { label: 'slice', dimension: 'Count', pluralises: true },
  Can: { label: 'can', dimension: 'Count', pluralises: true },
  Package: { label: 'pack', dimension: 'Count', pluralises: true },
  Bunch: { label: 'bunch', dimension: 'Count', pluralises: true },

  Pinch: { label: 'pinch', dimension: 'Imprecise', pluralises: true },
  Dash: { label: 'dash', dimension: 'Imprecise', pluralises: true },
  Splash: { label: 'splash', dimension: 'Imprecise', pluralises: true },
  Handful: { label: 'handful', dimension: 'Imprecise', pluralises: true },
  ToTaste: { label: 'to taste', dimension: 'Imprecise', pluralises: false },
}

/**
 * The unit select's option groups. Grouping by dimension is what makes a
 * 21-entry select usable — a cook looking for "tbsp" scans the volume block,
 * not the whole list — and it also teaches the model the list follows, which
 * is why the shopping list can add some of these together and not others.
 */
export const UNIT_GROUPS: ReadonlyArray<{ dimension: UnitDimension; label: string; units: UnitOfMeasure[] }> = [
  { dimension: 'Mass', label: 'Weight', units: ['Gram', 'Kilogram', 'Ounce', 'Pound'] },
  { dimension: 'Volume', label: 'Volume', units: ['Millilitre', 'Litre', 'Teaspoon', 'Tablespoon', 'Cup', 'FluidOunce'] },
  { dimension: 'Count', label: 'Count', units: ['Piece', 'Clove', 'Slice', 'Can', 'Package', 'Bunch'] },
  { dimension: 'Imprecise', label: 'To taste', units: ['Pinch', 'Dash', 'Splash', 'Handful', 'ToTaste'] },
]

export const UNITS: readonly UnitOfMeasure[] = UNIT_GROUPS.flatMap((g) => g.units)

/**
 * "2 cups", "500 g", "to taste" — the mirror of Units.Format for the places the
 * SPA renders a quantity it holds itself (the recipe detail page, the day
 * page). Server-sent strings are used as-is; this is only for client-held
 * values.
 */
export function formatQuantity(quantity: number, unit: UnitOfMeasure): string {
  const meta = UNIT_META[unit]
  if (unit === 'ToTaste') return meta.label

  // Trim a trailing ".0" the way the backend's "0.##" format does, so a
  // quantity reads "3" and not "3.0" on either side of the wire.
  const number = Number.isFinite(quantity) ? String(Number(quantity.toFixed(2))) : String(quantity)
  const word = quantity !== 1 && meta.pluralises ? `${meta.label}s` : meta.label
  return `${number} ${word}`
}

// ── Cuisines ──────────────────────────────────────────────────────────────

export const CUISINES: readonly Cuisine[] = [
  'American', 'British', 'Caribbean', 'Chinese', 'EasternEuropean', 'French',
  'German', 'Greek', 'Indian', 'Italian', 'Japanese', 'Korean', 'Mediterranean',
  'Mexican', 'MiddleEastern', 'NorthAfrican', 'Nordic', 'Portuguese', 'Spanish',
  'Thai', 'Turkish', 'Vietnamese', 'Other',
]

// ── Tags ──────────────────────────────────────────────────────────────────

/**
 * Grouped for the chip picker. 39 chips in one undifferentiated wall is a
 * worse authoring experience than the free-text field this replaces; grouped,
 * it reads as a set of small decisions ("what course is it", "how is it made").
 */
export const TAG_GROUPS: ReadonlyArray<{ label: string; tags: RecipeTag[] }> = [
  {
    label: 'Course',
    tags: ['Breakfast', 'Brunch', 'Lunch', 'Dinner', 'Appetizer', 'SideDish', 'Dessert', 'Snack', 'Drink'],
  },
  {
    label: 'Dish',
    tags: ['Salad', 'Soup', 'Stew', 'Sandwich', 'Pasta', 'Pizza', 'Curry', 'Bread', 'Cake'],
  },
  {
    label: 'Method',
    tags: ['Baking', 'Grilling', 'Roasting', 'Frying', 'SlowCooker', 'OnePot', 'NoCook', 'MealPrep'],
  },
  {
    label: 'Occasion',
    tags: ['Quick', 'Budget', 'Comfort', 'KidFriendly', 'PartyFood', 'Holiday', 'Leftovers'],
  },
  {
    label: 'Diet & character',
    tags: ['Vegetarian', 'Vegan', 'HighProtein', 'LowCalorie', 'Spicy', 'Healthy'],
  },
]

export const TAGS: readonly RecipeTag[] = TAG_GROUPS.flatMap((g) => g.tags)

/** How many tags the backend accepts on one recipe (RecipeGenerationAssistant.MaxTags). */
export const MAX_TAGS = 10

// ── Dietary restrictions ──────────────────────────────────────────────────

export const DIETARY_RESTRICTIONS: readonly DietaryRestriction[] = [
  'Vegetarian', 'Vegan', 'Pescatarian', 'GlutenFree', 'DairyFree', 'NutFree',
  'PeanutFree', 'EggFree', 'SoyFree', 'ShellfishFree', 'Halal', 'Kosher',
  'LowCarb', 'LowSodium',
]

// ── Labels ────────────────────────────────────────────────────────────────

// The handful of members whose label is not just their name with spaces
// inserted. Everything else goes through splitPascalCase, so appending a member
// to an enum needs no edit here at all.
const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  SideDish: 'Side dish',
  SlowCooker: 'Slow cooker',
  OnePot: 'One pot',
  NoCook: 'No cook',
  MealPrep: 'Meal prep',
  KidFriendly: 'Kid-friendly',
  PartyFood: 'Party food',
  HighProtein: 'High protein',
  LowCalorie: 'Low calorie',
  GlutenFree: 'Gluten-free',
  DairyFree: 'Dairy-free',
  NutFree: 'Nut-free',
  PeanutFree: 'Peanut-free',
  EggFree: 'Egg-free',
  SoyFree: 'Soy-free',
  ShellfishFree: 'Shellfish-free',
  LowCarb: 'Low-carb',
  LowSodium: 'Low-sodium',
  ToTaste: 'To taste',
}

/** "MiddleEastern" → "Middle Eastern". */
function splitPascalCase(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2')
}

/** The display label for any member of any of these vocabularies. */
export function label(member: Cuisine | RecipeTag | DietaryRestriction | UnitOfMeasure): string {
  return LABEL_OVERRIDES[member] ?? splitPascalCase(member)
}

/** The unit's written form ("tbsp"), as opposed to its prose label ("Tablespoon"). */
export function unitLabel(unit: UnitOfMeasure): string {
  return UNIT_META[unit].label
}
