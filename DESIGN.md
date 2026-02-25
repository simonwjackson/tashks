# Tasks Library — Design Spec

Derived from interview with Simon, 2026-02-24.

---

## 1. Principles

1. **No guilt** — The system never nags, shames, or creates obligation. No forced reviews, no piling up of undone recurring tasks, no urgency scores that make everything feel late. The library is a neutral data store; empathy lives in consumers.

2. **Flat and simple** — Area + Project + Tags. No nested hierarchies, no sub-projects, no action groups. Structure is achieved through filtering, not folders.

3. **Signals, not opinions** — The library stores raw signals (urgency, energy, age, nudge_count, staleness, due date) but never computes "you should do this." Consumers (OpenClaw, Pulse, briefing cron) own the surfacing logic.

4. **Energy-aware** — Every task carries an energy cost. The system makes it trivial to query "low-energy quick wins" or "high-energy deep work." Energy is a first-class filter dimension, not an afterthought.

5. **Dependencies are real** — `blocked_by` is actively used. Blocked tasks should be hideable from active views. When a blocking task completes, downstream tasks become available.

6. **Recurrence without guilt** — Recurring tasks must not pile up. Default behavior: a new instance replaces the previous unfinished one (unless explicitly configured to accumulate).

7. **AI-first capture and review** — The library assumes an AI consumer (OpenClaw) handles classification at capture and triage during review. No inbox concept needed. No built-in review cycles.

---

## 2. Schema Changes

### 2.1 New Fields on Task

| Field | Type | Default | Notes |
|---|---|---|---|
| `project` | `string \| null` | `null` | Free-text project name. Used for grouping/filtering. Not a foreign key — just a label. |
| `tags` | `string[]` | `[]` | Free-form tags for context-based filtering (e.g., `laptop`, `errands`, `phone`). |
| `due` | `string \| null` | `null` | ISO date `YYYY-MM-DD`. Hard deadline — missing this has consequences. Distinct from `defer_until`. |
| `recurrence` | `string \| null` | `null` | iCal RRULE string. See §2.2. |
| `recurrence_trigger` | `"clock" \| "completion"` | `"clock"` | **Clock**: next instance generated on schedule by systemd timer. **Completion**: next instance generated when current one is completed. See §2.2. |
| `recurrence_strategy` | `"replace" \| "accumulate"` | `"replace"` | What happens when a new instance is generated but the previous one isn't done. Only relevant for `clock` trigger (completion-driven tasks are always done before the next one spawns). |
| `recurrence_last_generated` | `string \| null` | `null` | ISO datetime. When the last instance was generated. Prevents duplicate generation. |

### 2.2 RecurrenceRule

Recurrence is expressed as an iCal RRULE string stored directly on the task:

```yaml
recurrence: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR"
```

The library parses and evaluates RRULE strings using a dedicated dependency (e.g., `rrule` npm package). This gives full expressive power — daily, weekly, monthly, yearly, `BYDAY`, `BYMONTHDAY`, `BYSETPOS`, `INTERVAL`, `UNTIL`, `COUNT`, etc.

**Examples:**

```yaml
# Every day
recurrence: "FREQ=DAILY"

# Every 2 weeks on Monday
recurrence: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"

# 1st and 15th of every month
recurrence: "FREQ=MONTHLY;BYMONTHDAY=1,15"

# Third Tuesday of every month
recurrence: "FREQ=MONTHLY;BYDAY=3TU"

# Last weekday of every month
recurrence: "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1"
```

**Two trigger modes:**

**Clock-driven** (`recurrence_trigger: clock`) — A systemd timer runs every N minutes and calls `tasks recurrence-check`. The RRULE is evaluated against the calendar: "every Monday" means a new instance appears on Monday regardless of whether you finished the last one. `recurrence_strategy` controls what happens to unfinished instances (replace or accumulate). Good for: standup notes, weekly reviews, rent reminders.

**Completion-driven** (`recurrence_trigger: completion`) — The next instance is generated when the current one is completed via `tasks complete`. The RRULE's `INTERVAL` determines the delay *from completion*: `FREQ=WEEKLY;INTERVAL=2` means "2 weeks after I finish this, create the next one." The `defer_until` on the new instance is set to `completed_at + interval`. `recurrence_strategy` is irrelevant here since the task is always done before the next one spawns. Good for: haircuts, oil changes, "review my finances" — things where the cadence is relative to when you last did it.

```yaml
# Clock-driven: "every Monday, whether I did last week's or not"
recurrence: "FREQ=WEEKLY;BYDAY=MO"
recurrence_trigger: clock
recurrence_strategy: replace

# Completion-driven: "2 weeks after I finish this"
recurrence: "FREQ=WEEKLY;INTERVAL=2"
recurrence_trigger: completion
```

See §3.4 for implementation details.

### 2.3 Removed/Unchanged Fields

- **`type` enum**: **Drop entirely.** The distinction between task/project/research/exploration/idea adds no filtering or behavioral value. A "project" is just a task with subtasks or other tasks referencing it via `blocked_by`. Everything else can be expressed with tags.
- **`area` enum**: Keep as-is. It's primarily a filter dimension — the specific values may evolve but the concept stays.
- **`urgency`**: Keep as a user-set signal, not a computed value. Library never overrides it.
- **`nudge_count`**: Keep. Consumers use it for staleness/avoidance detection.

### 2.4 Work Log (Revised)

The work log changes from **time blocks with multiple tasks** to **per-task time entries**. Each entry links to exactly one task and inherits metadata from it.

**Revised WorkLogEntry:**

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Generated from `<task-id>-<timestamp>` |
| `task_id` | `string` | The task this time was spent on |
| `started_at` | `string` | ISO datetime |
| `ended_at` | `string \| null` | ISO datetime. Null = still in progress (timer running). |
| `date` | `string` | ISO date `YYYY-MM-DD`. Derived from `started_at`. |

No `area` or `plan_date` on the entry itself — these are looked up from the linked task at query time.

**Example work log file:**

```yaml
id: revive-unzen-20260220T0900
task_id: revive-unzen
started_at: '2026-02-20T09:00:00Z'
ended_at: '2026-02-20T10:30:00Z'
date: '2026-02-20'
```

**Queries that become possible:**

- "What did I do today?" — list entries where `date = today`, join task titles
- "How much time on project X this week?" — filter entries by date range, join tasks by project
- "Total time on task X" — sum durations for all entries with that `task_id`

**Timer support:** Creating an entry with `ended_at: null` starts a timer. Updating it with an `ended_at` stops the timer. Only one entry should have `ended_at: null` at a time (enforced by convention, not the library — consumers can warn).

### 2.5 Updated Example Task File

```yaml
id: revive-unzen
title: Revive unzen server
status: active
area: infrastructure
project: homelab
tags:
  - hardware
  - weekend
created: '2026-02-16'
updated: '2026-02-20'
urgency: high
energy: high
due: '2026-03-01'
context: 'Mini-ITX build, 7th gen Intel, 32GB RAM, 10 drives'
subtasks:
  - text: Test PSU
    done: true
  - text: Reassemble drives
    done: false
blocked_by: []
estimated_minutes: 240
actual_minutes: null
completed_at: null
last_surfaced: '2026-02-19'
defer_until: null
nudge_count: 2
recurrence: null
recurrence_trigger: clock
recurrence_strategy: replace
recurrence_last_generated: null
```

---

## 3. New Capabilities

### 3.1 Repository Layer

**New operations:**

```typescript
interface TaskRepository {
  // ... existing operations ...

  // Dependency resolution: when completing a task, check if it unblocks others
  completeTask(id: string): Effect<Task, string>
  // Sets status=done, completed_at=now, and returns unblocked task IDs

  // Recurrence: generate next instance of a recurring task
  generateNextRecurrence(id: string): Effect<Task, string>
  // Creates new task from template, handles replace vs accumulate strategy

  // Clock-driven recurrence check: scan all recurring tasks and generate due instances
  processDueRecurrences(now: Date): Effect<{ created: Task[]; replaced: string[] }, string>
  // Called by systemd timer. See §3.4.

  // Bulk operations for review/triage
  listStale(days: number): Effect<Task[], string>
  // Tasks with status=active where updated < (today - days)
}
```

**Updated business rules:**

- `completeTask`: Sets `status=done`, `completed_at=now`. If the task has `recurrence` and `recurrence_trigger=completion`, generates the next instance with `defer_until` set to `completed_at + interval` derived from the RRULE. Clock-driven tasks are **not** triggered on completion — the timer handles those.
- `generateNextRecurrence` with `strategy=replace`: If previous instance is not done, marks it `dropped` before creating the new one.
- `generateNextRecurrence` with `strategy=accumulate`: Creates new instance regardless.
- `listTasks` filters: add support for `project`, `tags` (any match), `due_before`, `due_after`, `unblocked_only` (exclude tasks whose `blocked_by` contains any non-done task ID).

### 3.2 Query Layer

**New filter predicates:**

```typescript
// Dependency-aware filtering
isBlocked(task: Task, allTasks: Task[]): boolean
isUnblocked(task: Task, allTasks: Task[]): boolean

// Date-range queries
isDueBefore(date: string): (task: Task) => boolean
isDueThisWeek(today: string): (task: Task) => boolean
isDeferred(today: string): (task: Task) => boolean

// Energy/context filtering
hasEnergy(level: TaskEnergy): (task: Task) => boolean
hasTag(tag: string): (task: Task) => boolean
hasProject(project: string): (task: Task) => boolean

// Staleness / avoidance detection
isStalerThan(days: number, today: string): (task: Task) => boolean
// true if (today - updated) > days

// Completion log
wasCompletedOn(date: string): (task: Task) => boolean
wasCompletedBetween(start: string, end: string): (task: Task) => boolean
```

**New sort helpers:**

```typescript
byDueAsc(a: Task, b: Task): number        // nulls last
byEnergyAsc(a: Task, b: Task): number     // low → medium → high
byCreatedAsc(a: Task, b: Task): number
```

### 3.3 Saved Perspectives

A perspective is a named, saved query defined in a config file.

**Config location:** `<data-dir>/perspectives.yaml`

```yaml
quick-wins:
  filters:
    status: active
    energy: low
    unblocked_only: true
  sort: updated_desc

due-this-week:
  filters:
    status: active
    due_before: "+7d"   # relative date syntax
    unblocked_only: true
  sort: due_asc

avoiding:
  filters:
    status: active
    stale_days: 14
    unblocked_only: true
  sort: updated_asc

done-today:
  filters:
    status: done
    completed_on: "today"
  sort: completed_at_desc
```

**Implementation:** Perspectives are syntactic sugar over the filter/sort API. The library reads the config, resolves relative dates, and applies filters. No special data structures needed.

### 3.4 Recurrence Daemon

A systemd timer calls `tasks recurrence-check` every N minutes (e.g., every 15 minutes). The command is idempotent — running it multiple times in the same period produces no duplicates.

**This only handles `recurrence_trigger: clock` tasks.** Completion-driven recurrence is handled inline by `completeTask` (see §3.1).

**How `processDueRecurrences` works:**

1. List all tasks where `recurrence` is not null, `recurrence_trigger` is `clock`, and `status` is not `done`/`dropped`.
2. For each recurring task, evaluate the RRULE against the current time to determine if a new instance is due.
3. Track when the last instance was generated using `recurrence_last_generated` (ISO datetime). If the RRULE says the next occurrence after `recurrence_last_generated` is ≤ now, a new instance is due.
4. For each due task:
   - **`strategy=replace`**: If the current instance is still active (not done), mark it `dropped`, then create a fresh copy with `status=active`, new timestamps, and `recurrence_last_generated=now`.
   - **`strategy=accumulate`**: Create a new instance alongside the existing one. Both remain active.
5. Return a summary: `{ created: Task[], replaced: string[] }`.

**How completion-driven recurrence works (in `completeTask`):**

1. When a task with `recurrence_trigger: completion` is completed, extract the interval from the RRULE (e.g., `FREQ=WEEKLY;INTERVAL=2` → 2 weeks).
2. Create a new instance with:
   - `defer_until` = `completed_at` + interval (so it stays hidden until it's time)
   - `due` = recalculated if the original had a `due` (shifted by the same interval)
   - `status` = `active`, fresh timestamps, `recurrence_last_generated` = now
3. The original task stays `done`. No replace/accumulate logic needed — the task is always finished before the next one spawns.

**New schema field:**

| Field | Type | Default | Notes |
|---|---|---|---|
| `recurrence_last_generated` | `string \| null` | `null` | ISO datetime. When the last recurrence instance was created. Used to prevent duplicate generation. |

**Systemd timer (example NixOS config):**

```nix
systemd.timers.tasks-recurrence = {
  wantedBy = [ "timers.target" ];
  timerConfig = {
    OnCalendar = "*:0/15";  # every 15 minutes
    Persistent = true;       # catch up after sleep/reboot
  };
};

systemd.services.tasks-recurrence = {
  script = "tasks recurrence-check";
  serviceConfig.Type = "oneshot";
};
```

**Idempotency guarantee:** The combination of `recurrence_last_generated` and RRULE evaluation ensures that even if the timer fires multiple times in the same period, only one instance is created. If the system was off for a day and `Persistent=true` triggers a catch-up, it generates exactly the missed instances (not duplicates).

### 3.5 Hooks

Hooks are executable scripts that run in response to task lifecycle events. They follow XDG conventions and are the library's extension point — keeping the core opinion-free while allowing consumers to layer on behavior.

**Hook directory:** `${XDG_CONFIG_HOME:-~/.config}/tasks/hooks/`

**Events:**

| Event | Fires when | stdin | Can modify? |
|---|---|---|---|
| `on-create` | After a task is created | New task (JSON) | Yes — stdout replaces task |
| `on-modify` | After a task is updated | `{"old": Task, "new": Task}` (JSON) | Yes — stdout replaces new task |
| `on-complete` | After `completeTask` (before recurrence) | Completed task (JSON) | No |
| `on-delete` | After a task is deleted | Deleted task (JSON) | No |

**Execution model:**

1. The library scans the hook directory for executable files matching the pattern `on-<event>` or `on-<event>.*` (e.g., `on-create`, `on-create.sh`, `on-create.py`).
2. Multiple hooks per event are supported. They run in lexicographic order (prefix with `00-`, `01-`, etc. to control order).
3. **Mutating hooks** (`on-create`, `on-modify`): The task is passed as JSON on stdin. If the hook exits 0 and writes JSON to stdout, that JSON replaces the task. If it exits 0 with no stdout, the task is unchanged. If it exits non-zero, the operation is **aborted** and the error message (stderr) is returned to the caller.
4. **Non-mutating hooks** (`on-complete`, `on-delete`): The task is passed on stdin for informational purposes. Exit code is logged but does not block the operation.
5. Hooks inherit the environment. The library sets these additional env vars:
   - `TASKS_EVENT` — the event name (e.g., `create`, `modify`)
   - `TASKS_ID` — the task ID
   - `TASKS_DATA_DIR` — the data directory path

**Example hooks:**

```bash
# ~/.config/tasks/hooks/on-create
#!/usr/bin/env bash
# Auto-tag tasks with "work" if area is "work"
task=$(cat)
area=$(echo "$task" | jq -r '.area')
if [ "$area" = "work" ]; then
  echo "$task" | jq '.tags += ["work"]'
else
  echo "$task"
fi
```

```bash
# ~/.config/tasks/hooks/on-complete
#!/usr/bin/env bash
# Send a notification when a task is completed
task=$(cat)
title=$(echo "$task" | jq -r '.title')
notify-send "Task completed" "$title"
```

**Design notes:**

- Hooks are synchronous and blocking. The library waits for each hook to finish before proceeding. Keep them fast.
- No timeout is enforced by the library — a hung hook hangs the operation. This is intentional; the user owns their hooks.
- The hook directory is created lazily — the library does not fail if it doesn't exist, it just skips hook execution.
- Hooks are discovered at call time, not cached. Adding/removing a hook takes effect immediately.

---

## 4. CLI Additions

### 4.1 New Filters on `tasks list`

```
tasks list [--project <name>] [--tag <tag>] [--due-before <date>]
           [--due-after <date>] [--unblocked] [--stale <days>]
           [--energy <level>] [--completed-on <date>]
```

### 4.2 New Commands

```
tasks complete <id>
  # Completes a task (sets done + completed_at), triggers recurrence if applicable

tasks perspective <name>
  # Run a saved perspective by name

tasks perspectives
  # List all saved perspectives

tasks recurrence-check
  # Clock-driven: scan all recurring tasks, generate due instances.
  # Designed to be called by a systemd timer every N minutes. Idempotent.
```

### 4.3 New Options on `tasks create`

```
tasks create --title <title> [--project <name>] [--tags <tag1,tag2>]
             [--due <date>] [--defer-until <date>]
             [--recurrence <rrule>] [--recurrence-strategy <replace|accumulate>]
  # --recurrence takes an iCal RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO"
```

---

## 5. Deferred

These were discussed but explicitly deferred:

- **Network-based webhooks** — Hooks are local executables only. No HTTP callbacks, no pub/sub. If a consumer needs remote notifications, it can implement that as a hook script.
- **Built-in urgency algorithm** — No computed urgency scores. Library stores signals; consumers decide. If a default algorithm is ever needed, it goes in query.ts as an opt-in helper, never baked into the repository.
- **Inbox/triage status** — Not needed since OpenClaw handles classification at capture. If capture without AI becomes a use case, add a `needs_review: boolean` field then.
- **Recurrence UI in the library** — The library parses and evaluates RRULEs, but building a human-friendly recurrence editor is a consumer concern. The CLI accepts raw RRULE strings; OpenClaw can translate natural language ("every other Tuesday") into RRULEs.
- **Project-as-entity** — Projects are not separate YAML files. They're string labels on tasks. If project-level metadata is needed later (description, status, review date), introduce a `projects/` directory then.

---

## 6. Anti-Patterns

Things to actively avoid, derived from bad experiences:

1. **No guilt walls** — Never surface a long list of overdue/stale tasks without the consumer choosing to ask for it. The library should make staleness *queryable*, not *in-your-face*.

2. **No mandatory ceremonies** — No forced review cycles (OmniFocus). No "you must process your inbox" gates. Every workflow is opt-in.

3. **No computed urgency that overrides user intent** — TaskWarrior's urgency algorithm reorders tasks in ways that feel arbitrary. If a user sets urgency=low, the system respects that regardless of age or due date.

4. **No piling recurrence** — Recurring tasks that stack up when unfinished become a shame spiral. Default to replace strategy. Make accumulate opt-in and obvious.

5. **No deep nesting** — Resist the urge to add sub-projects, action groups, or nested task trees. Flat + tags + project label covers every real use case Simon described.

6. **No over-abstraction** — Don't build event buses, plugin systems, or generic extension points. The library is a data layer for one person's task system. YAGNI.

7. **No opinion in the library** — The library is Switzerland. It stores data, filters data, and returns data. All behavioral intelligence (nudging, surfacing, triage, classification) belongs in consumers.
