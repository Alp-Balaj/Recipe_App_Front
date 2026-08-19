# Recipe_App_Front — conventions & parallel-work contract

React 18 + Vite 5 + TypeScript (strict) + Tailwind 3. Import alias `@` → `src/`.

## Agent skills

### Issue tracker

Jira Cloud space `KAN` on `alpbalaj1203.atlassian.net`, label `frontend`,
reached through the Atlassian MCP server (configured in `.mcp.json`, so a fresh
clone only has to authenticate). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, as Jira labels under their default names.
See `docs/agents/triage-labels.md`.

### Domain docs

The glossary is `CONTEXT.md` and the decisions are `docs/adr/` — both in the
**sibling `Recipe_App_Back` checkout**, not this repo. They are deliberately
not duplicated here: `CONTEXT.md` opens by naming itself the domain shared by
both repos, and two copies of a ubiquitous language drift, which is the one
thing a shared vocabulary cannot survive. See `docs/agents/domain.md`.

## npm scripts

- `npm run dev` — Vite dev server (default port 5173)
- `npm run build` — `tsc && vite build` (typecheck IS part of the build; tests are typechecked too)
- `npm test` — `vitest run` (jsdom + Testing Library; setup in `src/test/setup.ts`, which stubs `window.matchMedia`)
- `npm run preview`

## Dev connectivity — the /api proxy

The backend (`Recipe_App_Back`) has **no CORS** and its routes have **no /api
prefix** (`/auth/*`, `/recipes/*` at the root). The Vite dev proxy bridges both:
`/api` → `http://localhost:5109` with a rewrite that strips the leading `/api`.

- All frontend fetches use the `/api` prefix: `fetch('/api/auth/login')` → `POST /auth/login` on :5109.
- Run the backend with the **http** launch profile. The https profile 307-redirects port 5109 and silently breaks the proxy.
- Never add CORS config anywhere — the proxy is the plan's answer for dev.

## Visual/styling idiom (keep it — no redesign)

> **Scoped exception — the meal-plan surfaces.** `/plan` and `/plan/:date` are
> being deliberately recomposed (month calendar + day page + reworked recipe
> picker). That work stays *inside* the vocabulary below — same tokens, same
> card idiom, same inline-style approach — it changes composition, not look.
> The only palette addition is the meal-temperature set (`--meal-b/-l/-d` and
> their `-ink` pairs) in `src/index.css`. Everywhere else, the no-redesign rule
> still holds.

> **Scoped exception — `/shopping-list`** (shop redesign, direction 1c, from an
> external design handoff). The page was rebuilt aisle-first with dish
> provenance: aisle/dish headings, buy-once rows carrying `Dish · Day`, touch
> swipe + long-press multi-select, a 328px desktop rail, and an all-bought
> receipt screen. It adds **no** palette tokens — the handoff's hexes turned out
> to be the light theme's existing values, so everything maps onto `--bg`,
> `--surface`, `--surface2`, `--accent`, `--accent-fill`, `--clay`, … and dark
> mode keeps working. Components live in `src/components/shopping/`, with the
> derivations (grouping, counts, provenance strings) isolated in
> `shoppingModel.ts` so the page's several counters cannot disagree.
> `/shopping-list` is in AppShell's `isWidePage` list for the rail's sake.

> **Scoped exception — `/cooked`** (KAN-9, the two-pane dish list). Adds **no**
> palette tokens and no new page. Above **1180px** (`COOKED_TWO_PANE` in
> `src/components/cooked/cookedLayout.ts` — one constant, read by both halves)
> `CookedPage` is a layout: a 380px list pane beside `/cooked/:recipeId` in its
> own scroller. Below it, nothing changes — the dish is its own screen, the list
> is not even fetched. `/cooked` joins `/shopping-list` in AppShell's
> `isWidePage` list to get the room; between 1024 and 1180px that only widens
> the pane the page is centred in, since the page keeps its own 720px canvas.
> Search is a **server** parameter (`?q=`), never a filter over loaded pages.

- **Inline styles over CSS variables** — `var(--surface)`, `var(--surface2)`, `var(--accent)`, `var(--accent-ink)`, `var(--muted)`, `var(--border)`, `var(--cardsh)`, `var(--tagbg)`, `var(--chipbg)`, … defined per theme in `src/index.css`.
- **Theming**: `data-mode="light|dark"` on the `.app-shell` root (owned by `src/components/ThemeRoot.tsx`); pages read `{ mode, setMode, toggleMode }` via `useOutletContext<ThemeContextValue>()`.
- **Cards**: `background: var(--surface)`, `border: 1px solid var(--border)`, `boxShadow: var(--cardsh)`, borderRadius 18–22.
- **Tags/badges**: the `Badge` primitive (`src/components/ui/badge.tsx`) with `variant="outline"` + tag/chip CSS variables. Buttons: `src/components/ui/button.tsx` or plain styled `<button>`s.
- **Page layout**: tab pages position themselves `absolute; inset: 0; bottom: var(--nav-h, 74px)` inside the shell frame (`--nav-h` is 0 on desktop). Headers: fontSize 22 / fontWeight 800 / letterSpacing -0.01em, muted 13px subtitle.
- Responsive split: `useMediaQuery('(min-width: 1024px)')` → desktop sidebar layout; below that, mobile/tablet frame with `BottomNav`.

## Routing (frozen contract from checkpoint 01)

`src/router.tsx` is the ONE route-registration file — **no later checkpoint
edits it**. Every route points at a page in `src/pages/`; checkpoints fill in
page files they own.

**Additive routes are the one sanctioned edit.** A plan may register a NEW path
pointing at a NEW page, with a comment naming the plan — nothing existing may be
changed or reordered. `/feed`, `/users/:id`, `/chat/:conversationId`, `/plan`,
`/shopping-list`, `/plan/:date` and (now-removed) `/plan/week` all landed this
way. Anything else in this file still stops and goes through an explicit
reviewed commit — including **removals**: `/plan/week` was retired on
2026-07-30 as one of those, once the Plan tab moved to `/plan` and nothing
pointed at the redirect any more — and **nesting**: `/admin` grew its tab
subtree that way (2026-08-09), and KAN-9 made `/cooked/:recipeId` a child of
`/cooked` (2026-08-11) so the dish list stays mounted beside the dish on a wide
window. Neither added, removed or reordered a path; both changed the shape of
entries that already existed, which is why neither was additive.

**Pages are lazy — never import one statically** (stream F, 2026-08-05, a
reviewed commit touching `router.tsx` and `AppShell.tsx`). Every page module is
declared once in `src/routeChunks.tsx` as `React.lazy`, and both renderers —
the route tree and AppShell's desktop backdrop — import from there and wrap the
component in that file's `page()` helper, which supplies the per-page `Suspense`
boundary. No path was added, removed or reordered; only the import strategy
changed. Entry bundle 688 kB → 430 kB (gzip 201 → 135), plus a chunk per page.

The rule matters because breaking it is **silent**: a static
`import SomePage from '@/pages/SomePage'` anywhere pins that module into the
entry chunk and turns its `lazy()` into a no-op, with no error and no failing
test — only a Vite build warning. Seven pages were already in that state via
AppShell. `src/routeChunks.test.ts` now asserts the invariant against the source
of both files, so it fails loudly instead. The Suspense boundary belongs at the
page, never above `ThemeRoot`/`AppShell`: higher up it would unmount the layout
on every navigation and reset `ThemeRoot`'s `mode` state, strobing dark mode
back to light on every click.

The table below is the whole of `src/router.tsx` as it stands, in file order.
`src/routeChunks.test.ts` asserts the page count (**34**) on purpose, so an
additive route bumps that number deliberately rather than by accident. (Nesting
an existing route under another does not: KAN-9 left it at 30; KAN-19's three
recovery screens took it to 33; KAN-21's `/reset-second-factor` took it to 34.)

| Route | Page file | Filled by |
|---|---|---|
| /login | `LoginPage.tsx` | checkpoint 02 |
| /register | `RegisterPage.tsx` | checkpoint 02 |
| /welcome | `OnboardingPage.tsx` | stream K (onboarding) |
| /verify-email | `VerifyEmailPage.tsx` | KAN-19 (the emailed verification link's landing page) |
| /forgot-password | `ForgotPasswordPage.tsx` | KAN-19 (ask for a reset link) |
| /reset-password | `ResetPasswordPage.tsx` | KAN-19 (spend a reset link, choose a new password) |
| /reset-second-factor | `ResetSecondFactorPage.tsx` | KAN-21 (ask for the link, and spend it — one page, keyed off `?token=`; starts a 48-hour wait rather than removing anything) |
| /feed | `FeedPage.tsx` | social-feed |
| /users/:id | `UserProfilePage.tsx` | social-feed |
| /users/:id/followers | `FollowListPage.tsx` | social-feed cp2 (one page, reads its kind off the pathname) |
| /users/:id/following | `FollowListPage.tsx` | social-feed cp2 (same page) |
| /chat | `ChatPage.tsx` | lane C (07/08) |
| /chat/:conversationId | `ChatPage.tsx` | lane C (07/08) |
| /discover | `BrowsePage.tsx` | lane A (04), rebuilt editorial by the Discover/Scan redesign |
| /plan | `MealPlanPage.tsx` | plan-page redesign (front door; renders `MealPlanMonthPage` for `?m=` and below 1024px) |
| /plan/week/:start | `MealPlanWeekPage.tsx` | meal-planning-ui, rehomed by the redesign, rebuilt days-as-rows by the week/shopping rework |
| /plan/cooks | `CookHistoryPage.tsx` | plan-page redesign (the cook log's history) |
| /plan/:date | `MealPlanDayPage.tsx` | meal-plan redesign (one day) |
| /cooked | `CookedPage.tsx` | KAN-4 (the dish collection; account-only, reached from the Profile tab and a link on /plan). Since KAN-9 also the LAYOUT for the child below |
| /cooked/:recipeId | `CookedDishPage.tsx` | KAN-5 (one dish's cooks and notes), nested under `/cooked` by KAN-9 — renders in the pane beside the list above 1180px, alone below it |
| /shopping-list | `ShoppingListPage.tsx` | meal-planning-ui, rewritten by the week/shopping rework (per-week projection + mark overlay) |
| /scan | `FoodScanPage.tsx` | stream N (food scanner), reshaped as a guided flow by the Discover/Scan redesign |
| /admin | `AdminLayout` + tabs | moderation; the subtree is `reports`, `users`, `users/:id`, `recipes/:id`, `events` |
| /notifications | `NotificationsPage.tsx` | stream A (notifications) |
| /profile | `ProfilePage.tsx` | checkpoint 02 (real username/logout) |
| /recipes/new | `RecipeFormPage.tsx` | lane B (05) |
| /recipes/import | `RecipeImportPage.tsx` | stream L (import) |
| /recipes/mine | `MyRecipesPage.tsx` | lane B (06) |
| /recipes/:id | `RecipeDetailPage.tsx` | lane A (03) |
| / and unknown | redirect → /discover | — |

The Plan tab lands on `/plan`. Since the plan-page redesign that is the
planning **front door** — "Next up" hero, seven-day strip, planned-calorie
ribbon, rate-your-last-cook prompt — and not the month calendar. The calendar
is still there, behind `Month view ›` (`/plan?m=YYYY-MM`) and on anything
narrower than 1024px, which the redesign did not cover. Any week is one click
away via `Open week ›`, and a day via the strip's cells.

> **Scoped exception — `/plan`** (plan-page redesign, from an external design
> handoff). Adds **no** palette tokens. Two things a later session must not
> "tidy away":
> - `src/hooks/usePantryReadiness.ts` returns `null` and is the ONLY thing
>   standing between the built-and-tested `KitchenReadinessCard` and its
>   designed column. Implementing that one hook lights the card up; deleting
>   the null branch in `MealPlanPage` breaks the seam.
> - `NextUpHero`'s `minHeight` + `clamp()` photo column are load-bearing at
>   1024–1150px, where `DiscoverHero`'s fixed height clips the CTA.
>
> Derivations counted more than once (coverage, free slots, open dinners,
> repeats) live in `src/lib/planWeek.ts`, following `shoppingModel.ts`, so the
> page's several counters cannot disagree. The old static `/plan/week` redirect is gone; that URL now
falls through to `/plan/:date` and renders the day page's invalid-date state.
`/shopping-list` has its own Shop tab — it no longer shares the
Plan tab with the meal-planning surfaces (that was a data relationship, the
list is generated from the week, not a usage one: planning happens at a table,
shopping happens one-handed in an aisle).

Shell internals (also frozen): `ThemeRoot.tsx` (theme + outlet context),
`AppShell.tsx` (sidebar/bottom-nav chrome; renders `/recipes/:id` in the
desktop canvas pane with `BrowsePage` as the backdrop), `navItems.ts` (tab
list + URL→active-tab mapping; `/recipes/*` highlights the Discover tab).

## API layer + auth (frozen at checkpoint 02 — import, never reshape)

Three shared modules under `src/api/` are FROZEN (additive-only, coordinated
edits). Lanes import them:

- `@/api/types` — wire shapes 1:1 with the backend DTOs (camelCase; enums are
  PascalCase string unions `Difficulty`/`Visibility`; nullable → `?: T | null`):
  `AuthResponse`, `RegisterRequest`, `LoginRequest`, `MeResponse`,
  `RecipeResponse`, `CreateRecipeRequest`, `RecipeListQuery`,
  `RecipeListResponse`, `RecipeIngredient`, `RecipeStep`, `Difficulty`,
  `Visibility`, `ValidationProblemResponse`, `ConflictResponse`.
- `@/api/client` — `apiFetch<T>(path, { method?, body?, query?, signal? })`.
  Prefixes `/api`, sends the session cookies (`credentials: 'same-origin'`),
  any-2xx = success, 204/empty → `undefined`. Array `query` values → repeated
  params (`?tags=a&tags=b`). Typed errors: `ApiError`, `ApiValidationError`
  (`.errors` PascalCase dict), `ApiUnauthorizedError`, `ApiConflictError`.
  On a 401 with a live session it refreshes ONCE (single-flight
  `refreshSession()`, also exported for the three multipart modules) and retries;
  only if that fails does it clear the session and let the guard redirect.
  `setSessionActive(bool)` replaced `setAuthToken` — with `httpOnly` cookies
  there is no token to hold, and the wrapper still needs to tell a guest's 401
  from an expired session's.
- `@/api/queryKeys` — `queryKeys.recipes.{all, lists(), list(f?), mine(f?),
  detail(id)}`, `queryKeys.chat.messages()`, `queryKeys.auth.{me(),
  emailVerification(), sessions()}`.

**KAN-20 reshaped all three** (cookie sessions, ADR-0009) — the sanctioned kind
of edit to a frozen module: its own reviewed commit, not a lane's ad-hoc change.
`AuthResponse` lost `token`/`expiresAtUtc`, so a bearer is now a compile error
rather than a habit. The session is two `httpOnly` cookies the browser owns and
script cannot read.

**KAN-21 touched all three again**, additively, as its own reviewed commit:

- `types.ts` — `MeResponse.secondFactorResetEffectiveAtUtc`. It is on IDENTITY
  rather than on the Security screen's own read because the warning has to
  reach **every live session**: somebody has started a 48-hour countdown to
  strip this account's second factor, and the only person who can stop it is
  whoever is still signed in. `/auth/me` and `/auth/refresh` both answer this
  shape, so an open tab learns about it within one access-token lifetime.
- `client.ts` — `ApiError.body` carries the parsed error payload, because two
  KAN-21 answers put a **number** in it that the screen has to say out loud
  (attempts left before a sign-in dies; seconds of backoff). `/auth/challenge`
  also joined `/auth/login` and `/auth/register` in the "a 401 here is an
  ANSWER, not an expiry" list — mistyping six digits must not sign anyone out.
- `queryKeys.ts` — `queryKeys.auth.secondFactor()`.

Second factor: `@/api/secondFactor` +
`components/profile/settings/SecondFactorPanel.tsx` (enrol, recovery codes,
turn off, cancel a pending reset) + `components/auth/SecondFactorChallengeForm`
(the code prompt, shared by `/login` and `/reset-password`) +
`components/auth/SecondFactorResetAlert` (the global pending-reset strip,
mounted in `AppShell` as a sanctioned amendment, like `NotificationBell`).
`qrcode.react` is the one runtime dependency it added — a QR is not something
to hand-roll, and the package has no dependencies of its own.

Auth: `@/auth/AuthContext` → `useAuth()` = `{ user: MeResponse | null, status,
login, register, logout, updateUsername, adoptSession }`. **`login` returns
something since KAN-21**: `null` when the account signed in (the un-enrolled
path, unchanged), or a `SecondFactorChallenge` when it did **not** — an enrolled
account's password buys the right to be asked for a code and nothing else, and
no session exists until that code is answered. Treating a challenge as a
successful sign-in is the one mistake here that would make the second factor
decorative, which is why it is a return value rather than a flag.
`POST /auth/password-reset/confirm` answers the same union for the same reason:
a reset link arrives by email, so it must not sign an enrolled account in.

`user` is IDENTITY, not a session, and nothing about it survives a reload: boot re-reads it from
`/auth/me`. `logout` is `async` — it POSTs `/auth/logout` so the server drops the
row, and callers must **await it before navigating** (navigating first lands on
/login while the store still says authenticated, and guest access then bounces
the user straight back in). The only `localStorage` key left is
`recipe_app_session` = `"1"`, a non-credential marker that tells boot whether to
ask the server at all — `httpOnly` cookies being invisible to script, there is
nothing else to look at. `adoptSession` (KAN-19) takes a session this store did
not open: password reset answers with identity and sets the cookies on the same
response, and it arrives at the reset page rather than here because that page is
the thing holding the one-use link.

Devices: `@/api/sessions` + `components/profile/settings/ActiveDevices.tsx` — the
Security screen's active-devices list (sign out one, or all the others).

Route protection is global in `AppShell.tsx`, so **a protected page
renders only when authenticated** — in tests use `@/test/utils`
`renderRoute(path)` (authenticated by default) or `renderApp(path)` (real
provider + MSW), and add endpoint mocks with `server.use(...)` from
`@/test/msw/server`. Reusable UI: `@/components/ui/TextField`,
`@/components/AuthScreen`.

## Parallelization — lane file ownership (from the frontend plan)

Checkpoints 01–02 are serial (foundation). After 02, three lanes run in
parallel with these boundaries:

| Lane | Checkpoints | Owns (create/edit) | Must not touch |
|---|---|---|---|
| A — browse | 03, 04 | `src/pages/RecipeDetailPage*`, `src/pages/BrowsePage*`, `src/hooks/useRecipe*`, their tests | router file, `src/api/*` shared modules (additive-only via new files), lane B/C pages |
| B — authoring | 05, 06 | `src/pages/RecipeFormPage*`, `src/pages/MyRecipesPage*`, `src/hooks/useRecipeMutations*`, their tests | same as above |
| C — chat | 07, 08 | `src/api/chat.ts`, `src/pages/ChatPage*`, chat components, their tests | same as above |

**Frozen shared modules rule**: `src/router.tsx` is frozen now; `src/api/types.ts`,
the fetch wrapper, and the query-key factory freeze at checkpoint 02. A lane
needing a change to a frozen module STOPS and surfaces it — the change lands as
its own explicit, reviewed commit on `master`, never an ad-hoc lane edit. New
files (e.g. lane C's `src/api/chat.ts`) are fine. Lane B has one sanctioned
exception: a small additive "+ new recipe" entry point in `Sidebar`/`BottomNav`/
`navItems.ts` (a link to `/recipes/new`, nothing structural).

## Testing policy — assume parallel sessions

Other agent sessions are usually working in sibling checkouts of these repos at
the same time. Anything that binds a port, launches a server, or drives a
browser collides with them. Those are therefore **opt-in only**: run e2e / live
/ browser verification ONLY when the user explicitly asks for it in this
session — never as a default step, and never as part of definition of done. Do
not ask whether to run it; the default is no.

- Never start `npm run dev` (:5173) or the backend (:5109) on your own
  initiative. `npm run build` is fine — it binds nothing.
- Run only the test files you touched (`npx vitest run <files>`), not the full
  `npm test` suite: the suite throws false failures whenever Docker is churning
  (see the sibling backend repo), and you cannot see what other sessions are
  running.
- Vitest + MSW tests are in-process (jsdom, no port) — they never conflict and
  are always safe.
- Full suites and the browser pass happen in a single dedicated verification
  session that the user starts for that purpose.

## Workflow

Verify-then-commit: sessions leave the main tree uncommitted; an independent
verification session (prompt saved in the vault `Tests/`) runs before anything
is committed to `master`. Lane branches may commit before verification —
`master` only receives verified work at merge time. Definition of done for
every checkpoint: `npm run build` exits 0 and the touched test files pass
(`npx vitest run <files>`). The full `npm test` run and live verification
against a running backend belong to the user-requested verification session
only — see the testing policy above; an implementation session never launches
the backend or the dev server.
