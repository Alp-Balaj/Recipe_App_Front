# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

**In this project both live in the sibling `Recipe_App_Back` checkout, not
here** — see "File structure" below before going looking for them.

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

The product is **single-context** — one glossary and one `docs/adr/` — but it
is split across two repositories, and the domain docs live in the backend one:

```
RecipeApp/
├── Recipe_App_Back/
│   ├── CONTEXT.md          ← the glossary, for BOTH repos
│   └── docs/adr/           ← the decisions, for BOTH repos
└── Recipe_App_Front/       ← you are here
    └── docs/agents/
```

They are deliberately **not** copied into this repo. `CONTEXT.md` opens by
naming itself the domain shared by both, and a ubiquitous language kept in two
places stops being one language the first time only one copy is edited. Read
them across the checkout; write changes to them there.

The canonical single-repo layout the rest of this document assumes would be:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

For reference, a multi-context repo (signalled by a root `CONTEXT-MAP.md`) would look like:

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

Note that the domain vocabulary is shared with `Recipe_App_Back`. Where a term
already has a definition on the backend side, reuse it rather than coining a
frontend-only synonym.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
