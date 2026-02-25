# Tasks Library — Standalone Library

## Goal

A standalone, transport-agnostic TypeScript library for managing personal tasks and work logs. YAML files on disk, Effect ecosystem, ProseQL persistence, CLI included. No knowledge of any consuming application.

## Data Format

Tasks and work log entries are stored as individual YAML files:
- **Tasks:** `<data-dir>/tasks/<id>.yaml`
- **Work log:** `<data-dir>/work-log/<id>.yaml`

Default data directory: `~/.local/share/tasks`

### Example task file

```yaml
id: revive-unzen
title: Revive unzen server
type: project
status: active
area: infrastructure
created: '2026-02-16'
updated: '2026-02-20'
urgency: high
energy: high
sprint_category: deep
context: 'Mini-ITX build, 7th gen Intel, 32GB RAM, 10 drives'
subtasks:
  - text: Test PSU
    done: true
  - text: Reassemble drives
    done: false
blocked_by: []
is_daily_highlight: false
estimated_minutes: 240
actual_minutes: null
completed_at: null
last_surfaced: '2026-02-19'
defer_until: null
nudge_count: 2
```

### Example work log file

```yaml
id: work-log-abc123
date: '2026-02-20'
sprint_category: deep
started_at: '2026-02-20T09:00:00Z'
ended_at: '2026-02-20T11:30:00Z'
tasks_completed:
  - revive-unzen
plan_date: '2026-02-20'
```

## Architecture

```
src/tasks/
  schema.ts          # Effect Schema definitions — the canonical types
  repository.ts      # ProseQL-backed CRUD (read/write/delete/list)
  query.ts           # Filtering, sorting, helper functions
  cli.ts             # @effect/cli entry point
```

No barrel files. No `index.ts`. Consumers import directly:

```typescript
import { Task, TaskCreateInput } from "./tasks/schema"
import { TaskRepository } from "./tasks/repository"
import { byUpdatedDescThenTitle } from "./tasks/query"
```

### schema.ts

Pure Effect Schema definitions. No I/O, no side effects.

**Enums:**
- `TaskType`: `"task" | "project" | "research" | "exploration" | "idea"`
- `TaskStatus`: `"active" | "backlog" | "blocked" | "done" | "dropped"`
- `TaskArea`: `"health" | "infrastructure" | "work" | "personal" | "blog" | "code" | "home"`
- `TaskUrgency`: `"low" | "medium" | "high" | "critical"`
- `TaskEnergy`: `"low" | "medium" | "high"`
- `SprintCategory`: `"fire" | "deadline" | "deep" | "admin" | "creative"`

**Task:**
| Field | Type | Notes |
|---|---|---|
| id | string | Generated from slugified title + random suffix |
| title | string | |
| type | TaskType | |
| status | TaskStatus | |
| area | TaskArea | |
| created | string | ISO date `YYYY-MM-DD` |
| updated | string | ISO date `YYYY-MM-DD` |
| urgency | TaskUrgency | |
| energy | TaskEnergy | |
| sprint_category | SprintCategory \| null | |
| context | string | Free-text notes |
| subtasks | Subtask[] | `{ text: string, done: boolean }` |
| blocked_by | string[] | Task IDs |
| is_daily_highlight | boolean | Only one task can be highlighted at a time |
| estimated_minutes | number \| null | |
| actual_minutes | number \| null | |
| completed_at | string \| null | ISO datetime |
| last_surfaced | string \| null | ISO date |
| defer_until | string \| null | ISO date — hidden from queries before this date |
| nudge_count | number | Times surfaced without action |

**TaskCreateInput:** All fields from Task, but only `title` required. Defaults: `type="task"`, `status="active"`, `area="personal"`, `urgency="medium"`, `energy="medium"`, timestamps auto-set to today.

**TaskPatch:** All Task fields optional (for partial updates). `updated` auto-set to today on any patch.

**WorkLogEntry:**
| Field | Type |
|---|---|
| id | string |
| date | string | ISO date |
| sprint_category | SprintCategory |
| started_at | string | ISO datetime |
| ended_at | string | ISO datetime |
| tasks_completed | string[] | Task IDs |
| plan_date | string \| null |

**WorkLogCreateInput / WorkLogPatch:** Same pattern as tasks — full for create, all-optional for patch.

### repository.ts

An Effect service (`Context.Tag`) backed by ProseQL. Reference the existing ProseQL implementation at `src/server/db/proseql.ts` for the persistence layer — it's a generic YAML-backed document store using `@effect/platform` FileSystem.

**Operations:**

```typescript
interface TaskRepository {
  listTasks(filters?: { status?: TaskStatus; area?: TaskArea; date?: string }): Effect<Task[], string>
  getTask(id: string): Effect<Task, string>
  createTask(input: TaskCreateInput): Effect<Task, string>
  updateTask(id: string, patch: TaskPatch): Effect<Task, string>
  deleteTask(id: string): Effect<{ deleted: true }, string>
  setDailyHighlight(id: string): Effect<Task, string>

  listWorkLog(filters?: { date?: string }): Effect<WorkLogEntry[], string>
  createWorkLogEntry(input: WorkLogCreateInput): Effect<WorkLogEntry, string>
  updateWorkLogEntry(id: string, patch: WorkLogPatch): Effect<WorkLogEntry, string>
  deleteWorkLogEntry(id: string): Effect<{ deleted: true }, string>
}
```

**Business rules:**
- `setDailyHighlight` clears highlight from all other tasks before setting the new one
- `createTask` generates ID from `slugify(title)-<random6>`
- `updateTask` always sets `updated` to today
- `listTasks` with `date` filter excludes tasks where `defer_until > date`
- Default sort: `updated` desc, then `title` asc

**Pure helpers to export:**
- `parseTaskRecord(unknown): Task | null` — validates/normalizes raw YAML data
- `parseWorkLogRecord(unknown): WorkLogEntry | null`
- `createTaskFromInput(TaskCreateInput): Task`
- `applyTaskPatch(Task, TaskPatch): Task`
- `applyWorkLogPatch(WorkLogEntry, WorkLogPatch): WorkLogEntry`
- `generateTaskId(title: string): string`
- `todayIso(): string`

### query.ts

Sorting and filtering helpers:
- `byUpdatedDescThenTitle(a: Task, b: Task): number`
- `byStartedAtDesc(a: WorkLogEntry, b: WorkLogEntry): number`
- Filter predicates for status, area, date/defer_until
- Room for future surfacing logic (urgency decay, energy matching, nudge detection)

### cli.ts

Use `@effect/cli` with `@effect/platform-node`.

**Global options:**
- `--data-dir <path>` — override data directory (default: `~/.local/share/tasks`)
- `--pretty` — human-readable output (default: JSON to stdout)

**Commands:**

```
tasks list [--status <status>] [--area <area>] [--date <YYYY-MM-DD>]
tasks get <id>
tasks create --title <title> [--type <type>] [--status <status>] [--area <area>] [--urgency <urgency>] [--energy <energy>] [--context <text>]
tasks update <id> [--title <title>] [--status <status>] [--area <area>] [--urgency <urgency>] [--energy <energy>] [--context <text>]
tasks delete <id>
tasks highlight <id>
tasks worklog list [--date <YYYY-MM-DD>]
tasks worklog create --sprint-category <cat> --started-at <iso> --ended-at <iso> [--tasks-completed <id,...>]
tasks worklog update <id> [--sprint-category <cat>] [--started-at <iso>] [--ended-at <iso>]
tasks worklog delete <id>
```

All enum options (`--status`, `--type`, `--area`, `--urgency`, `--energy`, `--sprint-category`) should use `Options.choice` for typesafe validation with tab completion.

## Dependencies

- `effect`
- `@effect/platform` + `@effect/platform-node`
- `@effect/cli`
- `yaml` (YAML parse/stringify)

No other dependencies. Specifically: no `@effect/rpc`, no web frameworks, no database drivers.

## Testing

- **Unit:** `parseTaskRecord`, `createTaskFromInput`, `applyTaskPatch`, `applyWorkLogPatch`, query helpers
- **Integration:** Repository CRUD using a temp directory with real YAML files
- **CLI smoke:** `list`, `create`, `get`, `update`, `delete` round-trip

Use `bun test`.

## Constraints

- Effect ecosystem only — no Zod, no plain validation
- No `@effect/rpc` — this library is transport-agnostic
- ProseQL is the persistence layer — don't bypass it with raw `fs` calls
- YAML file format is sacred — one file per entity, field names exactly as documented
- Existing task files at `~/.local/share/tasks/tasks/*.yaml` must parse correctly without migration
- No barrel files (`index.ts`)
