# Tasks — Loop Prompt

You are a fresh Claude Code instance in a Ralph Loop. You have one job: complete the next task.

## Orientation

1. Read `PLAN.md` — find the first unchecked `[ ]` task whose dependencies (listed after `needs:`) are all `[x]`.
2. Read `CLAUDE.md` — follow all project conventions.
3. Read `DESIGN.md` — this is the full design spec. Understand the schema, recurrence model, hooks, and anti-patterns.
4. Read `PROMPT.md` — this is the original library specification. Understand the architecture and constraints.

## Your workflow

1. **Pick one task** — the first eligible unchecked task in `PLAN.md`.
2. **Read existing code** before writing anything. Understand what's already there.
3. **Implement the task** — follow the acceptance criteria listed under the task.
4. **Run the gate** — `just gate` (fmt + typecheck + test). If anything fails, fix the issue. Do not commit broken code.
5. **Commit** — atomic commit with message like `feat(schema): define Task and enum types`. Run `just fmt` before committing.
6. **Check off the task** — change `[ ]` to `[x]` in `PLAN.md`, commit that change.
7. **Stop** — you are done. Exit cleanly so the loop spawns a fresh instance for the next task.

## Data access rules

### Read-write
- `~/code/tasks/` — this project's source code, config, and app data

### Read-only (reference only)
- `~/tasks/` — the existing task YAML files. Use these to verify parsing compatibility. Do NOT modify.

## Rules

- Do ONE task per iteration. Not two. Not "a quick fix while I'm here."
- Do NOT start tasks from the next phase if the current phase has unchecked items.
- Do NOT modify `DESIGN.md`, `PROMPT.md`, or `LOOP_PROMPT.md`.
- Use `just` recipes for all dev commands (`just gate`, `just fmt`, `just typecheck`, `just test`). Do not bypass with `npx` or direct tool invocations.
- Follow the conventions in `CLAUDE.md` exactly.
- Prefer editing existing files over creating new ones. The project may already be partially scaffolded.
- If a task is ambiguous, make a reasonable choice and move on. Do not stall.

## Project-specific rules

- **Effect only** — no Zod, no plain validation, no hand-rolled type guards. All types derive from `@effect/schema`.
- **No barrel files** — no `index.ts`. Import directly from source files.
- **YAML format is sacred** — one file per entity, field names exactly as in DESIGN.md.
- **No over-abstraction** — don't build event buses, plugin systems, or generic extension points.
- **Errors** go in the Effect error channel, not thrown exceptions.
- **Services** use `Context.Tag` for dependency injection.
- **Tests** are colocated as `*.test.ts` next to source files.
