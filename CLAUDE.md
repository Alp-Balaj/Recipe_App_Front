# Recipe_App_Front — conventions & parallel-work contract

React 18 + Vite 5 + TypeScript (strict) + Tailwind 3. Import alias `@` → `src/`.

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

- **Inline styles over CSS variables** — `var(--surface)`, `var(--surface2)`, `var(--accent)`, `var(--accent-ink)`, `var(--muted)`, `var(--border)`, `var(--cardsh)`, `var(--tagbg)`, `var(--chipbg)`, … defined per theme in `src/index.css`.
- **Theming**: `data-mode="light|dark"` on the `.app-shell` root (owned by `src/components/ThemeRoot.tsx`); pages read `{ mode, setMode, toggleMode }` via `useOutletContext<ThemeContextValue>()`.
- **Cards**: `background: var(--surface)`, `border: 1px solid var(--border)`, `boxShadow: var(--cardsh)`, borderRadius 18–22.
- **Tags/badges**: the `Badge` primitive (`src/components/ui/badge.tsx`) with `variant="outline"` + tag/chip CSS variables. Buttons: `src/components/ui/button.tsx` or plain styled `<button>`s.
- **Page layout**: tab pages position themselves `absolute; inset: 0; bottom: var(--nav-h, 74px)` inside the shell frame (`--nav-h` is 0 on desktop). Headers: fontSize 22 / fontWeight 800 / letterSpacing -0.01em, muted 13px subtitle.
- Responsive split: `useMediaQuery('(min-width: 1024px)')` → desktop sidebar layout; below that, mobile/tablet frame with `BottomNav`.

## Routing (frozen contract from checkpoint 01)

`src/router.tsx` is the ONE route-registration file — **no later checkpoint
edits it**. Every route points at a page in `src/pages/`; checkpoints fill in
page files they own:

| Route | Page file | Filled by |
|---|---|---|
| /login | `LoginPage.tsx` | checkpoint 02 |
| /register | `RegisterPage.tsx` | checkpoint 02 |
| /chat | `ChatPage.tsx` | lane C (07/08) |
| /discover | `BrowsePage.tsx` | lane A (04) |
| /profile | `ProfilePage.tsx` | checkpoint 02 (real username/logout) |
| /recipes/new | `RecipeFormPage.tsx` | lane B (05) |
| /recipes/mine | `MyRecipesPage.tsx` | lane B (06) |
| /recipes/:id | `RecipeDetailPage.tsx` | lane A (03) |
| / and unknown | redirect → /discover | — |

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
  Prefixes `/api`, attaches the bearer, any-2xx = success, 204/empty →
  `undefined`. Array `query` values → repeated params (`?tags=a&tags=b`). Typed
  errors: `ApiError`, `ApiValidationError` (`.errors` PascalCase dict),
  `ApiUnauthorizedError`, `ApiConflictError`. A 401 (except `/auth/login`) clears
  the session; the guard redirects.
- `@/api/queryKeys` — `queryKeys.recipes.{all, lists(), list(f?), mine(f?),
  detail(id)}`, `queryKeys.chat.messages()`, `queryKeys.auth.me()`.

Auth: `@/auth/AuthContext` → `useAuth()` = `{ user: AuthResponse | null, status,
login, register, logout }` (persisted to `localStorage`, boot-validated via
`/auth/me`). Route protection is global in `AppShell.tsx`, so **a protected page
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

## Workflow

Verify-then-commit: sessions leave the main tree uncommitted; an independent
verification session (prompt saved in the vault `Tests/`) runs before anything
is committed to `master`. Lane branches may commit before verification —
`master` only receives verified work at merge time. Definition of done for
every checkpoint: `npm run build` and `npm test` exit 0 + live verification
against the running backend where real endpoints are touched.
