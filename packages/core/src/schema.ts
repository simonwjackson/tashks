import * as Schema from "effect/Schema";

export const TaskStatus = Schema.Literal(
	"active",
	"backlog",
	"blocked",
	"done",
	"dropped",
	"on-hold",
);
export type TaskStatus = Schema.Schema.Type<typeof TaskStatus>;

export const TaskArea = Schema.Literal(
	"health",
	"infrastructure",
	"work",
	"personal",
	"blog",
	"code",
	"home",
	"side-projects",
);
export type TaskArea = Schema.Schema.Type<typeof TaskArea>;

export const TaskUrgency = Schema.Literal(
	"low",
	"medium",
	"high",
	"urgent",
	"critical",
);
export type TaskUrgency = Schema.Schema.Type<typeof TaskUrgency>;

export const TaskEnergy = Schema.Literal("low", "medium", "high");
export type TaskEnergy = Schema.Schema.Type<typeof TaskEnergy>;

// TODO: Task, TaskCreateInput, TaskPatch schemas
// TODO: WorkLogEntry, WorkLogCreateInput, WorkLogPatch schemas
// TODO: Subtask schema
// TODO: Recurrence fields (recurrence, recurrence_trigger, recurrence_strategy, recurrence_last_generated)
// TODO: New fields from DESIGN.md: project, tags, due
