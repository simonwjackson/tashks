import * as Schema from "effect/Schema";

const currentDateIso = (): string => new Date().toISOString().slice(0, 10);

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

export const TaskCreateInput = Schema.Struct({
	title: Schema.String,
	status: Schema.optionalWith(TaskStatus, { default: () => "active" }),
	area: Schema.optionalWith(TaskArea, { default: () => "personal" }),
	project: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
	tags: Schema.optionalWith(Schema.Array(Schema.String), {
		default: () => [],
	}),
	created: Schema.optionalWith(Schema.String, {
		default: currentDateIso,
	}),
	updated: Schema.optionalWith(Schema.String, {
		default: currentDateIso,
	}),
	urgency: Schema.optionalWith(TaskUrgency, { default: () => "medium" }),
	energy: Schema.optionalWith(TaskEnergy, { default: () => "medium" }),
	due: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
	context: Schema.optionalWith(Schema.String, {
		default: () => "",
	}),
	subtasks: Schema.optionalWith(Schema.Array(Subtask), {
		default: () => [],
	}),
	blocked_by: Schema.optionalWith(Schema.Array(Schema.String), {
		default: () => [],
	}),
	estimated_minutes: Schema.optionalWith(Schema.NullOr(Schema.Number), {
		default: () => null,
	}),
	actual_minutes: Schema.optionalWith(Schema.NullOr(Schema.Number), {
		default: () => null,
	}),
	completed_at: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
	last_surfaced: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
	defer_until: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
	nudge_count: Schema.optionalWith(Schema.Number, {
		default: () => 0,
	}),
	recurrence: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
	recurrence_trigger: Schema.optionalWith(TaskRecurrenceTrigger, {
		default: () => "clock",
	}),
	recurrence_strategy: Schema.optionalWith(TaskRecurrenceStrategy, {
		default: () => "replace",
	}),
	recurrence_last_generated: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
});
export type TaskCreateInput = Schema.Schema.Encoded<typeof TaskCreateInput>;

export const TaskPatch = Schema.Struct({
	id: Schema.optionalWith(Schema.String, { exact: true }),
	title: Schema.optionalWith(Schema.String, { exact: true }),
	status: Schema.optionalWith(TaskStatus, { exact: true }),
	area: Schema.optionalWith(TaskArea, { exact: true }),
	project: Schema.optionalWith(Schema.NullOr(Schema.String), { exact: true }),
	tags: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
	created: Schema.optionalWith(Schema.String, { exact: true }),
	updated: Schema.optionalWith(Schema.String, { exact: true }),
	urgency: Schema.optionalWith(TaskUrgency, { exact: true }),
	energy: Schema.optionalWith(TaskEnergy, { exact: true }),
	due: Schema.optionalWith(Schema.NullOr(Schema.String), { exact: true }),
	context: Schema.optionalWith(Schema.String, { exact: true }),
	subtasks: Schema.optionalWith(Schema.Array(Subtask), { exact: true }),
	blocked_by: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
	estimated_minutes: Schema.optionalWith(Schema.NullOr(Schema.Number), {
		exact: true,
	}),
	actual_minutes: Schema.optionalWith(Schema.NullOr(Schema.Number), {
		exact: true,
	}),
	completed_at: Schema.optionalWith(Schema.NullOr(Schema.String), {
		exact: true,
	}),
	last_surfaced: Schema.optionalWith(Schema.NullOr(Schema.String), {
		exact: true,
	}),
	defer_until: Schema.optionalWith(Schema.NullOr(Schema.String), {
		exact: true,
	}),
	nudge_count: Schema.optionalWith(Schema.Number, { exact: true }),
	recurrence: Schema.optionalWith(Schema.NullOr(Schema.String), {
		exact: true,
	}),
	recurrence_trigger: Schema.optionalWith(TaskRecurrenceTrigger, {
		exact: true,
	}),
	recurrence_strategy: Schema.optionalWith(TaskRecurrenceStrategy, {
		exact: true,
	}),
	recurrence_last_generated: Schema.optionalWith(Schema.NullOr(Schema.String), {
		exact: true,
	}),
});
export type TaskPatch = Schema.Schema.Encoded<typeof TaskPatch>;

export const ProjectStatus = Schema.Literal("active", "on-hold", "done", "dropped");
export type ProjectStatus = Schema.Schema.Type<typeof ProjectStatus>;

export const Project = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	status: ProjectStatus,
	area: TaskArea,
	description: Schema.String,
	tags: Schema.Array(Schema.String),
	created: Schema.String,
	updated: Schema.String,
});
export type Project = Schema.Schema.Type<typeof Project>;

export const ProjectCreateInput = Schema.Struct({
	title: Schema.String,
	status: Schema.optionalWith(ProjectStatus, { default: () => "active" as const }),
	area: Schema.optionalWith(TaskArea, { default: () => "personal" as const }),
	description: Schema.optionalWith(Schema.String, { default: () => "" }),
	tags: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] as string[] }),
	created: Schema.optionalWith(Schema.String, { default: currentDateIso }),
	updated: Schema.optionalWith(Schema.String, { default: currentDateIso }),
});
export type ProjectCreateInput = Schema.Schema.Encoded<typeof ProjectCreateInput>;

export const ProjectPatch = Schema.Struct({
	title: Schema.optionalWith(Schema.String, { exact: true }),
	status: Schema.optionalWith(ProjectStatus, { exact: true }),
	area: Schema.optionalWith(TaskArea, { exact: true }),
	description: Schema.optionalWith(Schema.String, { exact: true }),
	tags: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
});
export type ProjectPatch = Schema.Schema.Encoded<typeof ProjectPatch>;

export const WorkLogEntry = Schema.Struct({
	id: Schema.String,
	task_id: Schema.String,
	started_at: Schema.String,
	ended_at: Schema.NullOr(Schema.String),
	date: Schema.String,
});
export type WorkLogEntry = Schema.Schema.Type<typeof WorkLogEntry>;

export const WorkLogCreateInput = Schema.Struct({
	task_id: Schema.String,
	started_at: Schema.String,
	ended_at: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
});
export type WorkLogCreateInput = Schema.Schema.Encoded<
	typeof WorkLogCreateInput
>;

export const WorkLogPatch = Schema.Struct({
	id: Schema.optionalWith(Schema.String, { exact: true }),
	task_id: Schema.optionalWith(Schema.String, { exact: true }),
	started_at: Schema.optionalWith(Schema.String, { exact: true }),
	ended_at: Schema.optionalWith(Schema.NullOr(Schema.String), {
		exact: true,
	}),
	date: Schema.optionalWith(Schema.String, { exact: true }),
});
export type WorkLogPatch = Schema.Schema.Encoded<typeof WorkLogPatch>;
