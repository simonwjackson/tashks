export const WORKFLOW_PREAMBLE = `## Task Tracking Rules

**You MUST use the tashks tools for ALL task/issue tracking in this project.**

### Before Any Work

Before writing code, reading files for implementation, or making changes:

1. \`tashks_create\` — Create the task FIRST
2. \`tashks_update\` with \`claim: true\` — Mark it in progress
3. ONLY THEN start implementation

### Workflow

1. \`tashks_ready\` — Find unblocked work
2. \`tashks_update\` with \`claim: true, assignee: "agent"\` — Claim it
3. Work on it
4. \`tashks_close\` with reason — Complete it

### Task Types

\`bug\` | \`feature\` | \`task\` | \`epic\` | \`chore\`

### Priorities

\`0\` Critical | \`1\` High | \`2\` Medium | \`3\` Low | \`4\` Backlog

### Dependencies

Use \`tashks_dep\` to manage blocked_by relationships. A task with open blockers won't appear in \`tashks_ready\`.

### Comments

Use \`tashks_comments\` to record progress notes, decisions, or blockers on tasks.

### Prohibited

- NEVER use the TodoWrite tool or create markdown TODO lists
- NEVER start implementation without first creating a tashks task
`;
