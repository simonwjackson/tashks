# @tashks/ai

AI tool definitions for task management via LLM agents. Wraps `@tashks/core` repository operations as structured tool calls compatible with any LLM tool-use protocol.

## Installation

```bash
bun add @tashks/ai @tashks/core
```

## Quick Start

```typescript
import { allTools, WORKFLOW_PREAMBLE } from "@tashks/ai";
import { ProseqlRepositoryLive } from "@tashks/core/proseql-repository";

// Each plan/workstream owns its own task file
const repoLayer = ProseqlRepositoryLive({
  tasksFile: "./my-plan/tasks.yaml",
  workLogFile: "./my-plan/worklog.md",
  workLogFile: "./my-plan/worklog.yaml",
});

// Register tools with your LLM framework
for (const tool of allTools) {
  registerTool({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    handler: (params) => tool.execute(params, repo),
  });
}

// Inject preamble once at session start (not per-call)
const systemPrompt = WORKFLOW_PREAMBLE + "\n" + yourOtherInstructions;
```

## Tools

| Tool | Description |
|------|-------------|
| `tashks_ready` | Show unblocked active tasks sorted by priority |
| `tashks_create` | Create a new task |
| `tashks_update` | Update a task (includes `claim: true` for atomic claim) |
| `tashks_show` | Show full task details |
| `tashks_close` | Close a task (mark done) |
| `tashks_list` | List/search tasks with filters |
| `tashks_dep` | Manage task dependencies |
| `tashks_comments` | List or add comments on a task |
| `tashks_status` | Task board overview (counts by status/type) |
| `tashks_prime` | Generate markdown task board summary |
| `tashks_delete` | Delete a task permanently |

## Per-Plan Scoped Repos

The primary use case is per-plan task file ownership. Each workstream gets its own task file and work log, avoiding a centralized store:

```typescript
import { ProseqlRepositoryLive } from "@tashks/core/proseql-repository";

// Plan A has its own tasks
const planALayer = ProseqlRepositoryLive({
  tasksFile: "./plans/plan-a/tasks.yaml",
  workLogFile: "./plans/plan-a/worklog.yaml",
});

// Plan B is independent
const planBLayer = ProseqlRepositoryLive({
  tasksFile: "./plans/plan-b/tasks.yaml",
  workLogFile: "./plans/plan-b/worklog.yaml",
});

// Wire tools to the specific repo for this agent session
const tools = allTools.map((tool) => ({
  ...tool,
  handler: (params: any) => tool.execute(params, planARepo),
}));
```

## Structured Errors

All tools return structured errors when operations fail:

```typescript
interface ToolResult {
  text: string;                              // Human/LLM-readable message
  data?: unknown;                            // Structured data on success
  error?: { code: string; message: string }; // Structured error on failure
}
```

Error codes: `NOT_FOUND`, `VALIDATION`, `IO`, `UNKNOWN`.

```typescript
const result = await show.execute({ id: "missing" }, repo);
if (result.error) {
  switch (result.error.code) {
    case "NOT_FOUND": // task doesn't exist
    case "VALIDATION": // bad input
    case "IO": // filesystem error
    case "UNKNOWN": // unexpected
  }
}
```

## Claim Workflow

Use `claim: true` on `tashks_update` to atomically set assignee and status:

```typescript
// Defaults assignee to "agent" and status to "in_progress"
await update.execute({ id: "task-1", claim: true }, repo);

// Or specify a different assignee
await update.execute({ id: "task-1", claim: true, assignee: "bot-2" }, repo);
```
