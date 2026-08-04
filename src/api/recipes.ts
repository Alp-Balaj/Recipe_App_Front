// ─────────────────────────────────────────────────────────────────────────
// Recipe-corpus API calls that don't fit under any existing module (task-10,
// meal-planning-week-shopping-rework). Created by that task — same precedent
// as api/shopping.ts / api/mealPlans.ts / api/social.ts: a small file per
// feature area, wire fetchers only, going through the frozen apiFetch
// wrapper. Recipe reads mostly still live inline in the pages/hooks that need
// them; this file is where a recipe-adjacent endpoint with no natural
// existing home lands, and more can join it later.
// ─────────────────────────────────────────────────────────────────────────

// getIngredientNames was RETIRED by stream G, slice G3, along with the
// GET /ingredients/names endpoint behind it. Its replacement is
// searchIngredients in api/ingredients.ts: a curated catalogue the WRITE path
// resolves against, rather than a mirror of what people had already typed.
//
// This module is left in place — it is the "recipe-adjacent endpoint with no
// natural home" file and more can still join it.
export {}
