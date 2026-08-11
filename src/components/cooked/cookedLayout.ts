// ─────────────────────────────────────────────────────────────────────────
// Where Cooked stops being a phone screen and becomes a two-pane tool (KAN-9).
//
// ONE exported query, read by both halves of the surface: CookedPage decides
// whether to render the dish beside the list, and CookedDishPage decides
// whether it is a pane or a page. Those two answers must agree — a dish page
// that thinks it is a full screen inside the pane paints its own back link and
// its own top padding over a list that is right there — and the only reliable
// way to keep two media queries agreeing is for there to be one of them.
//
// 1180px, not the app's usual 1024px desktop breakpoint, and for the same
// reason /shopping-list picks 1180 for its rail: the desktop shell spends
// 252px on the sidebar, so at 1024px there is ~770px left for a 360px list AND
// a dish. The dish pane would be narrower than the phone screen it replaced.
// Below this, the phone behaviour is unchanged — list and dish as separate
// screens, which is what KAN-5 shipped and what a back gesture expects.
// ─────────────────────────────────────────────────────────────────────────

export const COOKED_TWO_PANE = '(min-width: 1180px)'

/** The list pane's width. The dish takes what is left. */
export const COOKED_LIST_PANE = 380
