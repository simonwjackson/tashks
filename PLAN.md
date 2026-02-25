# Tasks — Implementation Plan

Derived from [DESIGN.md](DESIGN.md) and [PROMPT.md](PROMPT.md).

---

## Phase 0: Project Setup

- [x] Initialize project tooling (flake.nix, package.json, tsconfig, justfile, biome)
- [x] Scaffold source files (packages/core/src/{schema,repository,query}.ts, packages/cli/src/cli.ts)
- [x] Create CLAUDE.md, PLAN.md, update LOOP_PROMPT.md

## Phase 1: Schema

- [x] Define enums: TaskStatus, TaskArea, TaskUrgency, TaskEnergy
- [ ] Define Subtask schema
- [ ] Define Task schema with all fields from DESIGN.md §2.1 + §2.5 (including project, tags, due, recurrence fields)
- [ ] Define TaskCreateInput (title required, defaults for everything else)
- [ ] Define TaskPatch (all fields optional)
- [ ] Define WorkLogEntry schema (revised per DESIGN.md §2.4: per-task entries)
- [ ] Define WorkLogCreateInput and WorkLogPatch
- [ ] Add tests for schema encode/decode round-trips

## Phase 2: Pure Helpers

- [ ] `generateTaskId(title)` — slugify + random suffix — *needs:* Phase 1
- [ ] `todayIso()` — current date as ISO string
- [ ] `createTaskFromInput(input)` — apply defaults, generate ID — *needs:* Phase 1
- [ ] `applyTaskPatch(task, patch)` — merge patch, auto-set `updated` — *needs:* Phase 1
- [ ] `parseTaskRecord(unknown)` — validate raw YAML data against Task schema — *needs:* Phase 1
- [ ] `parseWorkLogRecord(unknown)` — validate raw YAML data against WorkLogEntry schema — *needs:* Phase 1
- [ ] `applyWorkLogPatch(entry, patch)` — merge patch — *needs:* Phase 1
- [ ] Add tests for all pure helpers

## Phase 3: Query Layer

- [ ] Filter predicates: `isBlocked`, `isUnblocked` — *needs:* Phase 1
- [ ] Filter predicates: `isDueBefore`, `isDueThisWeek`, `isDeferred` — *needs:* Phase 1
- [ ] Filter predicates: `hasEnergy`, `hasTag`, `hasProject` — *needs:* Phase 1
- [ ] Filter predicates: `isStalerThan`, `wasCompletedOn`, `wasCompletedBetween` — *needs:* Phase 1
- [ ] Sort helpers: `byDueAsc`, `byEnergyAsc`, `byCreatedAsc`, `byUpdatedDescThenTitle` — *needs:* Phase 1
- [ ] Add tests for all predicates and sort helpers

## Phase 4: Repository Layer

- [ ] Implement `TaskRepository` service tag and live implementation — *needs:* Phase 2
- [ ] `listTasks` with filters (status, area, project, tags, due_before, due_after, unblocked_only, date/defer_until) — *needs:* Phase 3
- [ ] `getTask`, `createTask`, `updateTask`, `deleteTask` — *needs:* Phase 2
- [ ] `setDailyHighlight` (clears others first) — *needs:* Phase 2
- [ ] `listStale(days)` — *needs:* Phase 3
- [ ] Work log CRUD: `listWorkLog`, `createWorkLogEntry`, `updateWorkLogEntry`, `deleteWorkLogEntry` — *needs:* Phase 2
- [ ] Add integration tests with temp directory and real YAML files

## Phase 5: Recurrence

- [ ] `completeTask` — set done + completed_at, trigger completion-driven recurrence — *needs:* Phase 4
- [ ] `generateNextRecurrence` — create new instance, handle replace vs accumulate — *needs:* Phase 4
- [ ] `processDueRecurrences(now)` — scan clock-driven tasks, generate due instances — *needs:* Phase 4
- [ ] RRULE parsing and interval extraction using `rrule` package — *needs:* Phase 1
- [ ] Add tests for both trigger modes and both strategies

## Phase 6: Perspectives

- [ ] Perspective config loader (read `perspectives.yaml`) — *needs:* Phase 3
- [ ] Relative date resolution (`+7d`, `today`) — *needs:* Phase 3
- [ ] Apply perspective filters and sorts to task list — *needs:* Phase 4
- [ ] Add tests for perspective loading and application

## Phase 7: Hooks

- [ ] Hook discovery (scan hook directory for executables) — *needs:* Phase 4
- [ ] Mutating hooks (`on-create`, `on-modify`) — stdin/stdout JSON, abort on non-zero — *needs:* Phase 4
- [ ] Non-mutating hooks (`on-complete`, `on-delete`) — fire-and-forget — *needs:* Phase 4
- [ ] Environment variables: `TASKS_EVENT`, `TASKS_ID`, `TASKS_DATA_DIR` — *needs:* Phase 4
- [ ] Add tests for hook execution

## Phase 8: CLI

- [ ] Global options: `--data-dir`, `--pretty` — *needs:* Phase 4
- [ ] `tasks list` with all filter flags — *needs:* Phase 4
- [ ] `tasks get <id>` — *needs:* Phase 4
- [ ] `tasks create` with all options (including --project, --tags, --due, --recurrence) — *needs:* Phase 4
- [ ] `tasks update <id>` with all patch options — *needs:* Phase 4
- [ ] `tasks delete <id>` — *needs:* Phase 4
- [ ] `tasks highlight <id>` — *needs:* Phase 4
- [ ] `tasks complete <id>` — *needs:* Phase 5
- [ ] `tasks perspective <name>` and `tasks perspectives` — *needs:* Phase 6
- [ ] `tasks recurrence-check` — *needs:* Phase 5
- [ ] Worklog subcommands: list, create, update, delete — *needs:* Phase 4
- [ ] CLI smoke tests (round-trip create/get/list/update/delete)
