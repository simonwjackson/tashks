# Tashks — Project Conventions

## What is this?

A standalone, transport-agnostic TypeScript library for managing personal tasks and work logs. YAML files on disk, Effect ecosystem, CLI included. See [DESIGN.md](DESIGN.md) for the full design spec and [PROMPT.md](PROMPT.md) for the original library specification.

## Tech stack

- **Runtime:** Bun
- **Language:** TypeScript (strict mode, ES2022, NodeNext)
- **Core framework:** Effect ecosystem (`effect`, `@effect/platform`, `@effect/cli`)
- **Persistence:** YAML files on disk (one file per entity)
- **Formatting/linting:** Biome
- **Testing:** `bun test`
- **Task runner:** `just`
- **Package manager:** Bun
- **Nix:** Flake-based dev shell

## Dev commands

All commands go through `just`:

```
just install       # bun install
just typecheck     # tsc --build
just test          # bun test
just test-watch    # bun test --watch
just fmt           # biome format --write
just lint          # biome lint
just check         # biome check (format + lint, no writes)
just cli <args>    # run the CLI
just gate          # fmt + typecheck + test (pre-commit gate)
just clean         # remove build artifacts
```

## Architecture

Bun workspaces monorepo with two packages:

```
packages/
  core/              # @tashks/core — the library
    src/
      schema.ts      # Effect Schema definitions — the canonical types
      repository.ts  # YAML-backed CRUD (read/write/delete/list)
      query.ts       # Filtering, sorting, helper functions
  cli/               # @tashks/cli — CLI entry point (depends on @tashks/core)
    src/
      cli.ts         # @effect/cli entry point
```

## Code style

- **Effect only** — no Zod, no plain validation, no hand-rolled type guards
- **No barrel files** — no `index.ts`. Consumers import directly from the source file.
- **No over-abstraction** — don't build event buses, plugin systems, or generic extension points
- **YAML format is sacred** — one file per entity, field names exactly as documented in DESIGN.md
- **Imports:** use direct file paths, not barrel re-exports
- **Errors:** use Effect error channel, not thrown exceptions
- **Services:** use `Context.Tag` for dependency injection
- **Schemas:** all types derive from `@effect/schema` definitions
- **Tests:** colocate test files as `*.test.ts` next to source files

## Key design principles

1. **No guilt** — the system never nags or creates obligation
2. **Flat and simple** — Area + Project + Tags, no deep nesting
3. **Signals, not opinions** — store raw signals, never compute "you should do this"
4. **Energy-aware** — energy cost is a first-class filter dimension
5. **Dependencies are real** — `blocked_by` is actively used
6. **Recurrence without guilt** — default to replace strategy, no piling up

## Data directory

Default: `~/.local/share/tashks`
- Tasks: `<data-dir>/tasks/<id>.yaml`
- Work log: `<data-dir>/work-log/<id>.yaml`
- Perspectives: `<data-dir>/perspectives.yaml`

## Commit conventions

- `feat(scope): description` — new feature
- `fix(scope): description` — bug fix
- `chore(scope): description` — tooling, config, scaffolding
- `refactor(scope): description` — code restructuring
- `test(scope): description` — test additions/changes
- Scopes: `schema`, `repo`, `query`, `cli`, `recurrence`, `hooks`, `perspectives`
