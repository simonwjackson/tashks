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

export const Subtask = Schema.Struct({
	text: Schema.String,
	done: Schema.Boolean,
});
export type Subtask = Schema.Schema.Type<typeof Subtask>;

export const TaskRecurrenceTrigger = Schema.Literal("clock", "completion");
export type TaskRecurrenceTrigger = Schema.Schema.Type<
	typeof TaskRecurrenceTrigger
>;

export const TaskRecurrenceStrategy = Schema.Literal("replace", "accumulate");
export type TaskRecurrenceStrategy = Schema.Schema.Type<
	typeof TaskRecurrenceStrategy
>;

export const Task = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	status: TaskStatus,
	area: TaskArea,
	project: Schema.NullOr(Schema.String),
	tags: Schema.Array(Schema.String),
	created: Schema.String,
	updated: Schema.String,
	urgency: TaskUrgency,
	energy: TaskEnergy,
	due: Schema.NullOr(Schema.String),
	context: Schema.String,
	subtasks: Schema.Array(Subtask),
	blocked_by: Schema.Array(Schema.String),
	estimated_minutes: Schema.NullOr(Schema.Number),
	actual_minutes: Schema.NullOr(Schema.Number),
	completed_at: Schema.NullOr(Schema.String),
	last_surfaced: Schema.NullOr(Schema.String),
	defer_until: Schema.NullOr(Schema.String),
	nudge_count: Schema.Number,
	recurrence: Schema.NullOr(Schema.String),
	recurrence_trigger: TaskRecurrenceTrigger,
	recurrence_strategy: TaskRecurrenceStrategy,
	recurrence_last_generated: Schema.NullOr(Schema.String),
});
export type Task = Schema.Schema.Type<typeof Task>;

// TODO: WorkLogEntry, WorkLogCreateInput, WorkLogPatch schemas
