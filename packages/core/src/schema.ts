import * as Schema from "effect/Schema";

const currentDateIso = (): string => new Date().toISOString().slice(0, 10);

export const TaskStatus = Schema.String;
export type TaskStatus = Schema.Schema.Type<typeof TaskStatus>;

export const TaskArea = Schema.String;
export type TaskArea = Schema.Schema.Type<typeof TaskArea>;

export const TaskUrgency = Schema.String;
export type TaskUrgency = Schema.Schema.Type<typeof TaskUrgency>;

export const TaskEnergy = Schema.String;
export type TaskEnergy = Schema.Schema.Type<typeof TaskEnergy>;

export const Subtask = Schema.Struct({
	text: Schema.String,
	done: Schema.Boolean,
});
export type Subtask = Schema.Schema.Type<typeof Subtask>;

export const TaskRecurrenceTrigger = Schema.String;
export type TaskRecurrenceTrigger = Schema.Schema.Type<
	typeof TaskRecurrenceTrigger
>;

export const TaskRecurrenceStrategy = Schema.String;
export type TaskRecurrenceStrategy = Schema.Schema.Type<
	typeof TaskRecurrenceStrategy
>;

export const Comment = Schema.Struct({
	text: Schema.String,
	author: Schema.optionalWith(Schema.String, { default: () => "" }),
	created: Schema.optionalWith(Schema.String, {
		default: () => new Date().toISOString().slice(0, 10),
	}),
});
export type Comment = Schema.Schema.Type<typeof Comment>;

export const Task = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	description: Schema.String,
	status: TaskStatus,
	area: TaskArea,
	projects: Schema.Array(Schema.String),
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
	related: Schema.Array(Schema.String),
	is_template: Schema.Boolean,
	from_template: Schema.NullOr(Schema.String),
	priority: Schema.NullOr(Schema.Number),
	type: Schema.String,
	assignee: Schema.NullOr(Schema.String),
	parent: Schema.NullOr(Schema.String),
	close_reason: Schema.NullOr(Schema.String),
	comments: Schema.Array(Comment),
});
export type Task = Schema.Schema.Type<typeof Task>;

export const TaskCreateInput = Schema.Struct({
	title: Schema.String,
	status: Schema.optionalWith(TaskStatus, { default: () => "active" }),
	area: Schema.optionalWith(TaskArea, { default: () => "personal" }),
	projects: Schema.optionalWith(Schema.Array(Schema.String), {
		default: () => [],
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
	related: Schema.optionalWith(Schema.Array(Schema.String), {
		default: () => [],
	}),
	is_template: Schema.optionalWith(Schema.Boolean, {
		default: () => false,
	}),
	from_template: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
	priority: Schema.optionalWith(Schema.NullOr(Schema.Number), {
		default: () => null,
	}),
	type: Schema.optionalWith(Schema.String, {
		default: () => "task",
	}),
	assignee: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
	parent: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
	close_reason: Schema.optionalWith(Schema.NullOr(Schema.String), {
		default: () => null,
	}),
	description: Schema.optionalWith(Schema.String, {
		default: () => "",
	}),
	comments: Schema.optionalWith(Schema.Array(Comment), {
		default: () => [],
	}),
});
export type TaskCreateInput = Schema.Schema.Encoded<typeof TaskCreateInput>;

export const TaskPatch = Schema.Struct({
	id: Schema.optionalWith(Schema.String, { exact: true }),
	title: Schema.optionalWith(Schema.String, { exact: true }),
	status: Schema.optionalWith(TaskStatus, { exact: true }),
	area: Schema.optionalWith(TaskArea, { exact: true }),
	projects: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
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
	related: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
	is_template: Schema.optionalWith(Schema.Boolean, { exact: true }),
	from_template: Schema.optionalWith(Schema.NullOr(Schema.String), {
		exact: true,
	}),
	priority: Schema.optionalWith(Schema.NullOr(Schema.Number), {
		exact: true,
	}),
	type: Schema.optionalWith(Schema.String, { exact: true }),
	assignee: Schema.optionalWith(Schema.NullOr(Schema.String), {
		exact: true,
	}),
	parent: Schema.optionalWith(Schema.NullOr(Schema.String), {
		exact: true,
	}),
	close_reason: Schema.optionalWith(Schema.NullOr(Schema.String), {
		exact: true,
	}),
	description: Schema.optionalWith(Schema.String, { exact: true }),
	comments: Schema.optionalWith(Schema.Array(Comment), { exact: true }),
});
export type TaskPatch = Schema.Schema.Encoded<typeof TaskPatch>;

export const ProjectStatus = Schema.String;
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
	status: Schema.optionalWith(ProjectStatus, { default: () => "active" }),
	area: Schema.optionalWith(TaskArea, { default: () => "personal" }),
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
