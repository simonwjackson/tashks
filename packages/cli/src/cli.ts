#!/usr/bin/env node
import { join } from "node:path";
import * as Command from "@effect/cli/Command";
import * as Options from "@effect/cli/Options";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import {
	TaskRepository,
	TaskRepositoryLive,
	promoteSubtask,
	type ListTasksFilters,
	type ListProjectsFilters,
	type TaskRepositoryService,
} from "@tashks/core/repository";
import type {
	ProjectCreateInput as ProjectCreateInputType,
	ProjectPatch as ProjectPatchType,
} from "@tashks/core/schema";
import { ProseqlRepositoryLive } from "@tashks/core/proseql-repository";
import {
	applyPerspectiveToTasks,
	buildDependencyChain,
	byUrgencyDesc,
	isDeferred,
	isUnblocked,
	listAreas,
	listContexts,
	loadPerspectiveConfig,
} from "@tashks/core/query";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

export interface GlobalCliOptionsInput {
	readonly dataDir: Option.Option<string>;
	readonly tasksFile: Option.Option<string>;
	readonly worklogFile: Option.Option<string>;
	readonly pretty: boolean;
}

export interface GlobalCliOptions {
	readonly dataDir: string;
	readonly tasksFile: string;
	readonly worklogFile: string;
	readonly pretty: boolean;
}

export interface ListTasksCliOptionsInput {
	readonly status: Option.Option<NonNullable<ListTasksFilters["status"]>>;
	readonly area: Option.Option<NonNullable<ListTasksFilters["area"]>>;
	readonly project: Option.Option<string>;
	readonly tags: Option.Option<string>;
	readonly dueBefore: Option.Option<string>;
	readonly dueAfter: Option.Option<string>;
	readonly unblockedOnly: boolean;
	readonly date: Option.Option<string>;
	readonly durationMin: Option.Option<number>;
	readonly durationMax: Option.Option<number>;
	readonly context: Option.Option<string>;
	readonly staleDays: Option.Option<number>;
}

export interface ListWorkLogCliOptionsInput {
	readonly date: Option.Option<string>;
}

type TaskCreateInput = Parameters<TaskRepositoryService["createTask"]>[0];
type TaskPatchInput = Parameters<TaskRepositoryService["updateTask"]>[1];
type ListWorkLogFilters = NonNullable<
	Parameters<TaskRepositoryService["listWorkLog"]>[0]
>;
type WorkLogCreateInput = Parameters<
	TaskRepositoryService["createWorkLogEntry"]
>[0];
type WorkLogPatchInput = Parameters<
	TaskRepositoryService["updateWorkLogEntry"]
>[1];

export interface CreateTaskCliOptionsInput {
	readonly title: string;
	readonly status: Option.Option<NonNullable<TaskCreateInput["status"]>>;
	readonly area: Option.Option<string>;
	readonly project: ReadonlyArray<string>;
	readonly tags: Option.Option<string>;
	readonly due: Option.Option<string>;
	readonly deferUntil: Option.Option<string>;
	readonly urgency: Option.Option<NonNullable<TaskCreateInput["urgency"]>>;
	readonly energy: Option.Option<NonNullable<TaskCreateInput["energy"]>>;
	readonly context: Option.Option<string>;
	readonly recurrence: Option.Option<string>;
	readonly recurrenceTrigger: Option.Option<
		NonNullable<TaskCreateInput["recurrence_trigger"]>
	>;
	readonly recurrenceStrategy: Option.Option<
		NonNullable<TaskCreateInput["recurrence_strategy"]>
	>;
	readonly duration: Option.Option<number>;
	readonly related: Option.Option<string>;
	readonly blockedBy: Option.Option<string>;
	readonly subtasks: Option.Option<string>;
}

export interface UpdateTaskCliOptionsInput {
	readonly title: Option.Option<string>;
	readonly status: Option.Option<NonNullable<TaskPatchInput["status"]>>;
	readonly area: Option.Option<string>;
	readonly project: ReadonlyArray<string>;
	readonly tags: Option.Option<string>;
	readonly due: Option.Option<string>;
	readonly deferUntil: Option.Option<string>;
	readonly urgency: Option.Option<NonNullable<TaskPatchInput["urgency"]>>;
	readonly energy: Option.Option<NonNullable<TaskPatchInput["energy"]>>;
	readonly context: Option.Option<string>;
	readonly recurrence: Option.Option<string>;
	readonly recurrenceTrigger: Option.Option<
		NonNullable<TaskPatchInput["recurrence_trigger"]>
	>;
	readonly recurrenceStrategy: Option.Option<
		NonNullable<TaskPatchInput["recurrence_strategy"]>
	>;
	readonly duration: Option.Option<number>;
	readonly related: Option.Option<string>;
	readonly blockedBy: Option.Option<string>;
}

export interface CreateWorkLogCliOptionsInput {
	readonly taskId: string;
	readonly startedAt: string;
	readonly endedAt: Option.Option<string>;
}

export interface UpdateWorkLogCliOptionsInput {
	readonly taskId: Option.Option<string>;
	readonly startedAt: Option.Option<string>;
	readonly endedAt: Option.Option<string>;
}

export interface ListProjectsCliOptionsInput {
	readonly status: Option.Option<string>;
	readonly area: Option.Option<string>;
}

export interface CreateProjectCliOptionsInput {
	readonly title: string;
	readonly status: Option.Option<string>;
	readonly area: Option.Option<string>;
	readonly description: Option.Option<string>;
	readonly tags: Option.Option<string>;
}

export interface UpdateProjectCliOptionsInput {
	readonly title: Option.Option<string>;
	readonly status: Option.Option<string>;
	readonly area: Option.Option<string>;
	readonly description: Option.Option<string>;
	readonly tags: Option.Option<string>;
}

export type ListTasksExecute<R, E> = (
	options: GlobalCliOptions,
	filters: ListTasksFilters,
) => Effect.Effect<void, E, R>;

export type ListWorkLogExecute<R, E> = (
	options: GlobalCliOptions,
	filters: ListWorkLogFilters,
) => Effect.Effect<void, E, R>;

export type GetTaskExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
) => Effect.Effect<void, E, R>;

export type CreateTaskExecute<R, E> = (
	options: GlobalCliOptions,
	input: TaskCreateInput,
) => Effect.Effect<void, E, R>;

export type UpdateTaskExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
	patch: TaskPatchInput,
) => Effect.Effect<void, E, R>;

export type DeleteTaskExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
) => Effect.Effect<void, E, R>;

export type HighlightTaskExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
) => Effect.Effect<void, E, R>;

export type CompleteTaskExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
) => Effect.Effect<void, E, R>;

export type RecurrenceCheckExecute<R, E> = (
	options: GlobalCliOptions,
) => Effect.Effect<void, E, R>;

export type PerspectiveExecute<R, E> = (
	options: GlobalCliOptions,
	name: string,
) => Effect.Effect<void, E, R>;

export type PerspectivesExecute<R, E> = (
	options: GlobalCliOptions,
) => Effect.Effect<void, E, R>;

export type WorkLogExecute<R, E> = (
	options: GlobalCliOptions,
) => Effect.Effect<void, E, R>;

export type CreateWorkLogExecute<R, E> = (
	options: GlobalCliOptions,
	input: WorkLogCreateInput,
) => Effect.Effect<void, E, R>;

export type UpdateWorkLogExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
	patch: WorkLogPatchInput,
) => Effect.Effect<void, E, R>;

export type DeleteWorkLogExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
) => Effect.Effect<void, E, R>;

export type MigrateExecute<R, E> = (
	options: GlobalCliOptions,
	fromDir: string,
) => Effect.Effect<void, E, R>;

export type ListProjectsExecute<R, E> = (
	options: GlobalCliOptions,
	filters: ListProjectsFilters,
) => Effect.Effect<void, E, R>;

export type GetProjectExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
) => Effect.Effect<void, E, R>;

export type CreateProjectExecute<R, E> = (
	options: GlobalCliOptions,
	input: ProjectCreateInputType,
) => Effect.Effect<void, E, R>;

export type UpdateProjectExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
	patch: ProjectPatchType,
) => Effect.Effect<void, E, R>;

export type DeleteProjectExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
) => Effect.Effect<void, E, R>;

export type ProjectTasksExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
) => Effect.Effect<void, E, R>;

export type ProjectSummaryExecute<R, E> = (
	options: GlobalCliOptions,
	filters: ListProjectsFilters,
) => Effect.Effect<void, E, R>;

export type PromoteExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
	index: number,
) => Effect.Effect<void, E, R>;

export type AreasExecute<R, E> = (
	options: GlobalCliOptions,
) => Effect.Effect<void, E, R>;

export type ContextsExecute<R, E> = (
	options: GlobalCliOptions,
) => Effect.Effect<void, E, R>;

export type TemplateExecute<R, E> = (
	options: GlobalCliOptions,
) => Effect.Effect<void, E, R>;

export type TemplateListExecute<R, E> = (
	options: GlobalCliOptions,
) => Effect.Effect<void, E, R>;

export type TemplateCreateExecute<R, E> = (
	options: GlobalCliOptions,
	input: TaskCreateInput,
) => Effect.Effect<void, E, R>;

export type TemplateInstantiateExecute<R, E> = (
	options: GlobalCliOptions,
	templateId: string,
	overrides: {
		readonly title?: string;
		readonly due?: string;
		readonly defer_until?: string;
		readonly status?: string;
		readonly projects?: ReadonlyArray<string>;
	},
) => Effect.Effect<void, E, R>;

export type UnblockTaskExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
) => Effect.Effect<void, E, R>;

export type ChainExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
) => Effect.Effect<void, E, R>;

export type NextTaskExecute<R, E> = (
	options: GlobalCliOptions,
	energy?: string,
) => Effect.Effect<void, E, R>;

export type DropTaskExecute<R, E> = (
	options: GlobalCliOptions,
	id: string,
) => Effect.Effect<void, E, R>;

export type TodayExecute<R, E> = (
	options: GlobalCliOptions,
) => Effect.Effect<void, E, R>;

export const defaultDataDir = (
	env: NodeJS.ProcessEnv = process.env,
): string => {
	const home = env.HOME;
	return home !== undefined && home.length > 0
		? `${home}/.local/share/tashks`
		: ".local/share/tashks";
};

export const resolveGlobalCliOptions = (
	options: GlobalCliOptionsInput,
	env: NodeJS.ProcessEnv = process.env,
): GlobalCliOptions => {
	const dataDir = Option.getOrElse(options.dataDir, () => defaultDataDir(env));
	const tasksFile = Option.getOrElse(options.tasksFile, () =>
		join(dataDir, "tasks.yaml"),
	);
	const worklogFile = Option.getOrElse(options.worklogFile, () =>
		join(dataDir, "work-log.yaml"),
	);
	return {
		dataDir,
		tasksFile,
		worklogFile,
		pretty: options.pretty,
	};
};

const makeRepositoryLayer = (options: GlobalCliOptions) =>
	ProseqlRepositoryLive({
		tasksFile: options.tasksFile,
		workLogFile: options.worklogFile,
	});

export const formatOutput = (value: unknown, pretty: boolean): string => {
	const serialized = JSON.stringify(value, null, pretty ? 2 : undefined);
	return serialized ?? "null";
};

const toUndefined = <A>(value: Option.Option<A>): A | undefined =>
	Option.match(value, {
		onNone: () => undefined,
		onSome: (present) => present,
	});

const parseTagFilter = (
	value: Option.Option<string>,
): ReadonlyArray<string> | undefined => {
	const raw = toUndefined(value);
	if (raw === undefined) {
		return undefined;
	}

	const parsed = raw
		.split(",")
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);

	return parsed.length > 0 ? parsed : undefined;
};

const parseSubtasksOption = (
	value: string,
): Array<{ text: string; done: boolean }> => {
	const trimmed = value.trim();
	if (trimmed.startsWith("[")) {
		const parsed = JSON.parse(trimmed) as Array<{ text: string; done?: boolean }>;
		return parsed.map((item) => ({
			text: item.text,
			done: item.done ?? false,
		}));
	}
	return trimmed
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.map((text) => ({ text, done: false }));
};

export const resolveListTaskFilters = (
	options: ListTasksCliOptionsInput,
): ListTasksFilters => {
	const status = toUndefined(options.status);
	const area = toUndefined(options.area);
	const project = toUndefined(options.project);
	const tags = parseTagFilter(options.tags);
	const dueBefore = toUndefined(options.dueBefore);
	const dueAfter = toUndefined(options.dueAfter);
	const date = toUndefined(options.date);
	const durationMin = toUndefined(options.durationMin);
	const durationMax = toUndefined(options.durationMax);
	const context = toUndefined(options.context);
	const staleDays = toUndefined(options.staleDays);

	return {
		...(status !== undefined ? { status } : {}),
		...(area !== undefined ? { area } : {}),
		...(project !== undefined ? { project } : {}),
		...(tags !== undefined ? { tags } : {}),
		...(dueBefore !== undefined ? { due_before: dueBefore } : {}),
		...(dueAfter !== undefined ? { due_after: dueAfter } : {}),
		...(options.unblockedOnly ? { unblocked_only: true } : {}),
		...(date !== undefined ? { date } : {}),
		...(durationMin !== undefined ? { duration_min: durationMin } : {}),
		...(durationMax !== undefined ? { duration_max: durationMax } : {}),
		...(context !== undefined ? { context } : {}),
		...(staleDays !== undefined ? { stale_days: staleDays } : {}),
	};
};

export const resolveCreateTaskInput = (
	options: CreateTaskCliOptionsInput,
): TaskCreateInput => {
	const status = toUndefined(options.status);
	const area = toUndefined(options.area);
	const projects = options.project.length > 0 ? [...options.project] : undefined;
	const tags = parseTagFilter(options.tags);
	const due = toUndefined(options.due);
	const deferUntil = toUndefined(options.deferUntil);
	const urgency = toUndefined(options.urgency);
	const energy = toUndefined(options.energy);
	const context = toUndefined(options.context);
	const recurrence = toUndefined(options.recurrence);
	const recurrenceTrigger = toUndefined(options.recurrenceTrigger);
	const recurrenceStrategy = toUndefined(options.recurrenceStrategy);
	const duration = toUndefined(options.duration);
	const related = parseTagFilter(options.related);
	const blockedBy = parseTagFilter(options.blockedBy);
	const subtasksRaw = toUndefined(options.subtasks);
	const subtasks = subtasksRaw !== undefined ? parseSubtasksOption(subtasksRaw) : undefined;

	return {
		title: options.title,
		...(status !== undefined ? { status } : {}),
		...(area !== undefined ? { area } : {}),
		...(projects !== undefined ? { projects } : {}),
		...(tags !== undefined ? { tags } : {}),
		...(due !== undefined ? { due } : {}),
		...(deferUntil !== undefined ? { defer_until: deferUntil } : {}),
		...(urgency !== undefined ? { urgency } : {}),
		...(energy !== undefined ? { energy } : {}),
		...(context !== undefined ? { context } : {}),
		...(recurrence !== undefined ? { recurrence } : {}),
		...(recurrenceTrigger !== undefined
			? { recurrence_trigger: recurrenceTrigger }
			: {}),
		...(recurrenceStrategy !== undefined
			? { recurrence_strategy: recurrenceStrategy }
			: {}),
		...(duration !== undefined ? { estimated_minutes: duration } : {}),
		...(related !== undefined ? { related } : {}),
		...(blockedBy !== undefined ? { blocked_by: blockedBy } : {}),
		...(subtasks !== undefined ? { subtasks } : {}),
	};
};

export const resolveUpdateTaskPatch = (
	options: UpdateTaskCliOptionsInput,
): TaskPatchInput => {
	const title = toUndefined(options.title);
	const status = toUndefined(options.status);
	const area = toUndefined(options.area);
	const projects = options.project.length > 0 ? [...options.project] : undefined;
	const tags = parseTagFilter(options.tags);
	const due = toUndefined(options.due);
	const deferUntil = toUndefined(options.deferUntil);
	const urgency = toUndefined(options.urgency);
	const energy = toUndefined(options.energy);
	const context = toUndefined(options.context);
	const recurrence = toUndefined(options.recurrence);
	const recurrenceTrigger = toUndefined(options.recurrenceTrigger);
	const recurrenceStrategy = toUndefined(options.recurrenceStrategy);
	const duration = toUndefined(options.duration);
	const related = parseTagFilter(options.related);
	const blockedBy = parseTagFilter(options.blockedBy);

	return {
		...(title !== undefined ? { title } : {}),
		...(status !== undefined ? { status } : {}),
		...(area !== undefined ? { area } : {}),
		...(projects !== undefined ? { projects } : {}),
		...(tags !== undefined ? { tags } : {}),
		...(due !== undefined ? { due } : {}),
		...(deferUntil !== undefined ? { defer_until: deferUntil } : {}),
		...(urgency !== undefined ? { urgency } : {}),
		...(energy !== undefined ? { energy } : {}),
		...(context !== undefined ? { context } : {}),
		...(recurrence !== undefined ? { recurrence } : {}),
		...(recurrenceTrigger !== undefined
			? { recurrence_trigger: recurrenceTrigger }
			: {}),
		...(recurrenceStrategy !== undefined
			? { recurrence_strategy: recurrenceStrategy }
			: {}),
		...(duration !== undefined ? { estimated_minutes: duration } : {}),
		...(related !== undefined ? { related } : {}),
		...(blockedBy !== undefined ? { blocked_by: blockedBy } : {}),
	};
};

export const resolveListWorkLogFilters = (
	options: ListWorkLogCliOptionsInput,
): ListWorkLogFilters => {
	const date = toUndefined(options.date);

	return {
		...(date !== undefined ? { date } : {}),
	};
};

export const resolveCreateWorkLogInput = (
	options: CreateWorkLogCliOptionsInput,
): WorkLogCreateInput => {
	const endedAt = toUndefined(options.endedAt);

	return {
		task_id: options.taskId,
		started_at: options.startedAt,
		...(endedAt !== undefined ? { ended_at: endedAt } : {}),
	};
};

export const resolveUpdateWorkLogPatch = (
	options: UpdateWorkLogCliOptionsInput,
): WorkLogPatchInput => {
	const taskId = toUndefined(options.taskId);
	const startedAt = toUndefined(options.startedAt);
	const endedAt = toUndefined(options.endedAt);

	return {
		...(taskId !== undefined ? { task_id: taskId } : {}),
		...(startedAt !== undefined ? { started_at: startedAt } : {}),
		...(endedAt !== undefined ? { ended_at: endedAt } : {}),
	};
};

export const resolveListProjectFilters = (
	options: ListProjectsCliOptionsInput,
): ListProjectsFilters => {
	const status = toUndefined(options.status);
	const area = toUndefined(options.area);

	return {
		...(status !== undefined ? { status } : {}),
		...(area !== undefined ? { area } : {}),
	};
};

export const resolveCreateProjectInput = (
	options: CreateProjectCliOptionsInput,
): ProjectCreateInputType => {
	const status = toUndefined(options.status) as ProjectCreateInputType["status"];
	const area = toUndefined(options.area) as ProjectCreateInputType["area"];
	const description = toUndefined(options.description);
	const tags = parseTagFilter(options.tags);

	return {
		title: options.title,
		...(status !== undefined ? { status } : {}),
		...(area !== undefined ? { area } : {}),
		...(description !== undefined ? { description } : {}),
		...(tags !== undefined ? { tags } : {}),
	};
};

export const resolveUpdateProjectPatch = (
	options: UpdateProjectCliOptionsInput,
): ProjectPatchType => {
	const title = toUndefined(options.title);
	const status = toUndefined(options.status) as ProjectPatchType["status"];
	const area = toUndefined(options.area) as ProjectPatchType["area"];
	const description = toUndefined(options.description);
	const tags = parseTagFilter(options.tags);

	return {
		...(title !== undefined ? { title } : {}),
		...(status !== undefined ? { status } : {}),
		...(area !== undefined ? { area } : {}),
		...(description !== undefined ? { description } : {}),
		...(tags !== undefined ? { tags } : {}),
	};
};

export const dataDirOption = Options.text("data-dir").pipe(
	Options.withDescription("Override the tasks data directory (deprecated: use --tasks-file and --worklog-file)"),
	Options.optional,
);

export const tasksFileOption = Options.text("tasks-file").pipe(
	Options.withDescription("Path to tasks data file (e.g. tasks.yaml, tasks.md)"),
	Options.optional,
);

export const worklogFileOption = Options.text("worklog-file").pipe(
	Options.withDescription("Path to work-log data file (e.g. work-log.yaml, work-log.jsonl)"),
	Options.optional,
);

export const prettyOption = Options.boolean("pretty").pipe(
	Options.withDescription("Pretty-print JSON output"),
);


export const makeListCommand = <R, E>(execute: ListTasksExecute<R, E>) =>
	Command.make(
		"list",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			status: Options.text("status").pipe(
				Options.withDescription("Filter by task status"),
				Options.optional,
			),
			area: Options.text("area").pipe(
				Options.withDescription("Filter by task area"),
				Options.optional,
			),
			project: Options.text("project").pipe(
				Options.withDescription("Filter by project"),
				Options.optional,
			),
			tags: Options.text("tags").pipe(
				Options.withDescription(
					"Comma-separated tags; any match includes task",
				),
				Options.optional,
			),
			dueBefore: Options.text("due-before").pipe(
				Options.withDescription(
					"Include tasks with due date on or before this date",
				),
				Options.optional,
			),
			dueAfter: Options.text("due-after").pipe(
				Options.withDescription(
					"Include tasks with due date on or after this date",
				),
				Options.optional,
			),
			unblockedOnly: Options.boolean("unblocked-only").pipe(
				Options.withDescription(
					"Exclude tasks blocked by non-done dependencies",
				),
			),
			date: Options.text("date").pipe(
				Options.withDescription(
					"Reference date for defer-until filtering (YYYY-MM-DD)",
				),
				Options.optional,
			),
			durationMin: Options.integer("duration-min").pipe(
				Options.withDescription(
					"Include tasks with estimated_minutes >= this value",
				),
				Options.optional,
			),
			durationMax: Options.integer("duration-max").pipe(
				Options.withDescription(
					"Include tasks with estimated_minutes <= this value",
				),
				Options.optional,
			),
			context: Options.text("context").pipe(
				Options.withDescription("Filter by context"),
				Options.optional,
			),
			staleDays: Options.integer("stale-days").pipe(
				Options.withDescription(
					"Include only tasks not updated in N days",
				),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const filters = resolveListTaskFilters(options);
				yield* execute(globalOptions, filters);
			}),
	).pipe(Command.withDescription("List tasks with optional filters"));

export const makeGetCommand = <R, E>(execute: GetTaskExecute<R, E>) =>
	Command.make(
		"get",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Task ID")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id);
			}),
	).pipe(Command.withDescription("Get a task by id"));

export const makeCreateCommand = <R, E>(execute: CreateTaskExecute<R, E>) =>
	Command.make(
		"create",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			title: Options.text("title").pipe(Options.withDescription("Task title")),
			status: Options.text("status").pipe(
				Options.withDescription("Initial task status"),
				Options.optional,
			),
			area: Options.text("area").pipe(
				Options.withDescription("Task area"),
				Options.optional,
			),
			project: Options.text("project").pipe(
				Options.withDescription("Project label (repeatable)"),
				Options.repeated,
			),
			tags: Options.text("tags").pipe(
				Options.withDescription("Comma-separated tags"),
				Options.optional,
			),
			due: Options.text("due").pipe(
				Options.withDescription("Due date (YYYY-MM-DD)"),
				Options.optional,
			),
			deferUntil: Options.text("defer-until").pipe(
				Options.withDescription("Hide until date (YYYY-MM-DD)"),
				Options.optional,
			),
			urgency: Options.text("urgency").pipe(
				Options.withDescription("Urgency level"),
				Options.optional,
			),
			energy: Options.text("energy").pipe(
				Options.withDescription("Energy requirement"),
				Options.optional,
			),
			context: Options.text("context").pipe(
				Options.withDescription("Free-form context notes"),
				Options.optional,
			),
			recurrence: Options.text("recurrence").pipe(
				Options.withDescription("iCal RRULE string"),
				Options.optional,
			),
			recurrenceTrigger: Options.text("recurrence-trigger").pipe(
				Options.withDescription("Recurrence trigger mode"),
				Options.optional,
			),
			recurrenceStrategy: Options.text("recurrence-strategy").pipe(
				Options.withDescription(
					"Clock recurrence strategy for unfinished tasks",
				),
				Options.optional,
			),
			duration: Options.integer("duration").pipe(
				Options.withDescription("Estimated duration in minutes"),
				Options.optional,
			),
			related: Options.text("related").pipe(
				Options.withDescription("Comma-separated related task IDs"),
				Options.optional,
			),
			blockedBy: Options.text("blocked-by").pipe(
				Options.withDescription("Comma-separated IDs of blocking tasks"),
				Options.optional,
			),
			subtasks: Options.text("subtasks").pipe(
				Options.withDescription(
					'Comma-separated subtask texts, or JSON array of {text,done} objects',
				),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const input = resolveCreateTaskInput(options);
				yield* execute(globalOptions, input);
			}),
	).pipe(Command.withDescription("Create a task"));

export const makeUpdateCommand = <R, E>(execute: UpdateTaskExecute<R, E>) =>
	Command.make(
		"update",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Task ID")),
			title: Options.text("title").pipe(
				Options.withDescription("Updated task title"),
				Options.optional,
			),
			status: Options.text("status").pipe(
				Options.withDescription("Updated task status"),
				Options.optional,
			),
			area: Options.text("area").pipe(
				Options.withDescription("Updated task area"),
				Options.optional,
			),
			project: Options.text("project").pipe(
				Options.withDescription("Updated project label (repeatable)"),
				Options.repeated,
			),
			tags: Options.text("tags").pipe(
				Options.withDescription("Updated comma-separated tags"),
				Options.optional,
			),
			due: Options.text("due").pipe(
				Options.withDescription("Updated due date (YYYY-MM-DD)"),
				Options.optional,
			),
			deferUntil: Options.text("defer-until").pipe(
				Options.withDescription("Updated hidden-until date (YYYY-MM-DD)"),
				Options.optional,
			),
			urgency: Options.text("urgency").pipe(
				Options.withDescription("Updated urgency level"),
				Options.optional,
			),
			energy: Options.text("energy").pipe(
				Options.withDescription("Updated energy requirement"),
				Options.optional,
			),
			context: Options.text("context").pipe(
				Options.withDescription("Updated context notes"),
				Options.optional,
			),
			recurrence: Options.text("recurrence").pipe(
				Options.withDescription("Updated iCal RRULE string"),
				Options.optional,
			),
			recurrenceTrigger: Options.text("recurrence-trigger").pipe(
				Options.withDescription("Updated recurrence trigger mode"),
				Options.optional,
			),
			recurrenceStrategy: Options.text("recurrence-strategy").pipe(
				Options.withDescription("Updated clock recurrence strategy"),
				Options.optional,
			),
			duration: Options.integer("duration").pipe(
				Options.withDescription("Updated estimated duration in minutes"),
				Options.optional,
			),
			related: Options.text("related").pipe(
				Options.withDescription("Updated comma-separated related task IDs"),
				Options.optional,
			),
			blockedBy: Options.text("blocked-by").pipe(
				Options.withDescription("Updated comma-separated IDs of blocking tasks"),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const patch = resolveUpdateTaskPatch(options);
				yield* execute(globalOptions, options.id, patch);
			}),
	).pipe(Command.withDescription("Update a task by id"));

export const makeDeleteCommand = <R, E>(execute: DeleteTaskExecute<R, E>) =>
	Command.make(
		"delete",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Task ID")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id);
			}),
	).pipe(Command.withDescription("Delete a task by id"));

export const makeHighlightCommand = <R, E>(
	execute: HighlightTaskExecute<R, E>,
) =>
	Command.make(
		"highlight",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Task ID")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id);
			}),
	).pipe(Command.withDescription("Set daily highlight task by id"));

export const makeCompleteCommand = <R, E>(execute: CompleteTaskExecute<R, E>) =>
	Command.make(
		"complete",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Task ID")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id);
			}),
	).pipe(Command.withDescription("Complete a task by id"));

export const makeRecurrenceCheckCommand = <R, E>(
	execute: RecurrenceCheckExecute<R, E>,
) =>
	Command.make(
		"recurrence-check",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions);
			}),
	).pipe(Command.withDescription("Process due clock-driven recurring tasks"));

export const makePerspectiveCommand = <R, E>(
	execute: PerspectiveExecute<R, E>,
) =>
	Command.make(
		"perspective",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			name: Options.text("name").pipe(Options.withDescription("Perspective name")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.name);
			}),
	).pipe(Command.withDescription("Run a saved perspective by name"));

export const makePerspectivesCommand = <R, E>(
	execute: PerspectivesExecute<R, E>,
) =>
	Command.make(
		"perspectives",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions);
			}),
	).pipe(Command.withDescription("List saved perspectives"));

export const makeWorkLogListCommand = <R, E>(
	execute: ListWorkLogExecute<R, E>,
) =>
	Command.make(
		"list",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			date: Options.text("date").pipe(
				Options.withDescription("Filter entries by date (YYYY-MM-DD)"),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const filters = resolveListWorkLogFilters(options);
				yield* execute(globalOptions, filters);
			}),
	).pipe(Command.withDescription("List work log entries"));

export const makeWorkLogCreateCommand = <R, E>(
	execute: CreateWorkLogExecute<R, E>,
) =>
	Command.make(
		"create",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			taskId: Options.text("task-id").pipe(
				Options.withDescription("Task id for the work log entry"),
			),
			startedAt: Options.text("started-at").pipe(
				Options.withDescription("Start timestamp (ISO datetime)"),
			),
			endedAt: Options.text("ended-at").pipe(
				Options.withDescription("End timestamp (ISO datetime)"),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const input = resolveCreateWorkLogInput(options);
				yield* execute(globalOptions, input);
			}),
	).pipe(Command.withDescription("Create a work log entry"));

export const makeWorkLogUpdateCommand = <R, E>(
	execute: UpdateWorkLogExecute<R, E>,
) =>
	Command.make(
		"update",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Work log entry ID")),
			taskId: Options.text("task-id").pipe(
				Options.withDescription("Updated task id"),
				Options.optional,
			),
			startedAt: Options.text("started-at").pipe(
				Options.withDescription("Updated start timestamp (ISO datetime)"),
				Options.optional,
			),
			endedAt: Options.text("ended-at").pipe(
				Options.withDescription("Updated end timestamp (ISO datetime)"),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const patch = resolveUpdateWorkLogPatch(options);
				yield* execute(globalOptions, options.id, patch);
			}),
	).pipe(Command.withDescription("Update a work log entry by id"));

export const makeWorkLogDeleteCommand = <R, E>(
	execute: DeleteWorkLogExecute<R, E>,
) =>
	Command.make(
		"delete",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Work log entry ID")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id);
			}),
	).pipe(Command.withDescription("Delete a work log entry by id"));

export const makeMigrateCommand = <R, E>(
	execute: MigrateExecute<R, E>,
) =>
	Command.make(
		"migrate",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			from: Options.text("from").pipe(
				Options.withDescription(
					"Path to old data directory (containing tasks/ and work-log/ subdirectories)",
				),
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.from);
			}),
	).pipe(
		Command.withDescription(
			"Migrate tasks and work-log entries from old per-file layout to proseql",
		),
	);

export const makePromoteCommand = <R, E>(execute: PromoteExecute<R, E>) =>
	Command.make(
		"promote",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Task ID")),
			index: Options.integer("index").pipe(
				Options.withDescription("Subtask index (0-based)"),
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id, options.index);
			}),
	).pipe(Command.withDescription("Promote a subtask to a full task"));

export const makeAreasCommand = <R, E>(execute: AreasExecute<R, E>) =>
	Command.make(
		"areas",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions);
			}),
	).pipe(Command.withDescription("List unique areas in use"));

export const makeContextsCommand = <R, E>(execute: ContextsExecute<R, E>) =>
	Command.make(
		"contexts",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions);
			}),
	).pipe(Command.withDescription("List unique contexts in use"));

export const makeTemplateListCommand = <R, E>(
	execute: TemplateListExecute<R, E>,
) =>
	Command.make(
		"list",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions);
			}),
	).pipe(Command.withDescription("List task templates"));

export const makeTemplateCreateCommand = <R, E>(
	execute: TemplateCreateExecute<R, E>,
) =>
	Command.make(
		"create",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			title: Options.text("title").pipe(Options.withDescription("Template title")),
			area: Options.text("area").pipe(
				Options.withDescription("Template area"),
				Options.optional,
			),
			project: Options.text("project").pipe(
				Options.withDescription("Project label (repeatable)"),
				Options.repeated,
			),
			tags: Options.text("tags").pipe(
				Options.withDescription("Comma-separated tags"),
				Options.optional,
			),
			urgency: Options.text("urgency").pipe(
				Options.withDescription("Urgency level"),
				Options.optional,
			),
			energy: Options.text("energy").pipe(
				Options.withDescription("Energy requirement"),
				Options.optional,
			),
			context: Options.text("context").pipe(
				Options.withDescription("Free-form context notes"),
				Options.optional,
			),
			duration: Options.integer("duration").pipe(
				Options.withDescription("Estimated duration in minutes"),
				Options.optional,
			),
			related: Options.text("related").pipe(
				Options.withDescription("Comma-separated related task IDs"),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const input = resolveCreateTaskInput({
					...options,
					status: Option.none(),
					due: Option.none(),
					deferUntil: Option.none(),
					recurrence: Option.none(),
					recurrenceTrigger: Option.none(),
					recurrenceStrategy: Option.none(),
					blockedBy: Option.none(),
					subtasks: Option.none(),
				});
				yield* execute(globalOptions, { ...input, is_template: true });
			}),
	).pipe(Command.withDescription("Create a task template"));

export const makeTemplateInstantiateCommand = <R, E>(
	execute: TemplateInstantiateExecute<R, E>,
) =>
	Command.make(
		"instantiate",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Template ID")),
			title: Options.text("title").pipe(
				Options.withDescription("Override title"),
				Options.optional,
			),
			due: Options.text("due").pipe(
				Options.withDescription("Override due date (YYYY-MM-DD)"),
				Options.optional,
			),
			deferUntil: Options.text("defer-until").pipe(
				Options.withDescription("Override defer date (YYYY-MM-DD)"),
				Options.optional,
			),
			status: Options.text("status").pipe(
				Options.withDescription("Override status"),
				Options.optional,
			),
			project: Options.text("project").pipe(
				Options.withDescription("Override project (repeatable)"),
				Options.repeated,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const overrides: {
					title?: string;
					due?: string;
					defer_until?: string;
					status?: string;
					projects?: ReadonlyArray<string>;
				} = {};
				const title = toUndefined(options.title);
				if (title !== undefined) overrides.title = title;
				const due = toUndefined(options.due);
				if (due !== undefined) overrides.due = due;
				const deferUntil = toUndefined(options.deferUntil);
				if (deferUntil !== undefined) overrides.defer_until = deferUntil;
				const status = toUndefined(options.status);
				if (status !== undefined) overrides.status = status;
				if (options.project.length > 0)
					overrides.projects = [...options.project];
				yield* execute(globalOptions, options.id, overrides);
			}),
	).pipe(Command.withDescription("Create a task from a template"));

export const makeTemplateCommand = <R, E>(
	execute: TemplateExecute<R, E>,
	executeList: TemplateListExecute<R, E>,
	executeCreate: TemplateCreateExecute<R, E>,
	executeInstantiate: TemplateInstantiateExecute<R, E>,
) =>
	Command.make(
		"template",
		{ dataDir: dataDirOption, tasksFile: tasksFileOption, worklogFile: worklogFileOption, pretty: prettyOption },
		({ dataDir, tasksFile, worklogFile, pretty }) =>
			execute(resolveGlobalCliOptions({ dataDir, tasksFile, worklogFile, pretty })),
	).pipe(
		Command.withDescription("Manage task templates"),
		Command.withSubcommands([
			makeTemplateListCommand(executeList),
			makeTemplateCreateCommand(executeCreate),
			makeTemplateInstantiateCommand(executeInstantiate),
		]),
	);

export const makeUnblockCommand = <R, E>(execute: UnblockTaskExecute<R, E>) =>
	Command.make(
		"unblock",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Task ID to complete and unblock dependents")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id);
			}),
	).pipe(Command.withDescription("Complete a task and show which dependents are now unblocked"));

export const makeChainCommand = <R, E>(execute: ChainExecute<R, E>) =>
	Command.make(
		"chain",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Task ID")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id);
			}),
	).pipe(Command.withDescription("Show the dependency chain (ancestors and descendants) for a task"));

export const makeNextCommand = <R, E>(execute: NextTaskExecute<R, E>) =>
	Command.make(
		"next",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			energy: Options.text("energy").pipe(
				Options.withDescription("Filter by energy level (low, medium, high)"),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const energy = toUndefined(options.energy);
				yield* execute(globalOptions, energy);
			}),
	).pipe(Command.withDescription("Get the next actionable task (highest urgency, unblocked, not deferred)"));

export const makeDropCommand = <R, E>(execute: DropTaskExecute<R, E>) =>
	Command.make(
		"drop",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Task ID")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id);
			}),
	).pipe(Command.withDescription("Drop a task (set status to dropped)"));

export const makeTodayCommand = <R, E>(execute: TodayExecute<R, E>) =>
	Command.make(
		"today",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions);
			}),
	).pipe(Command.withDescription("Show today's briefing: daily highlight, due/overdue tasks, and undeferred tasks"));

export const makeProjectListCommand = <R, E>(
	execute: ListProjectsExecute<R, E>,
) =>
	Command.make(
		"list",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			status: Options.text("status").pipe(
				Options.withDescription("Filter by project status"),
				Options.optional,
			),
			area: Options.text("area").pipe(
				Options.withDescription("Filter by project area"),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const filters = resolveListProjectFilters(options);
				yield* execute(globalOptions, filters);
			}),
	).pipe(Command.withDescription("List projects with optional filters"));

export const makeProjectGetCommand = <R, E>(
	execute: GetProjectExecute<R, E>,
) =>
	Command.make(
		"get",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Project ID")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id);
			}),
	).pipe(Command.withDescription("Get a project by id"));

export const makeProjectCreateCommand = <R, E>(
	execute: CreateProjectExecute<R, E>,
) =>
	Command.make(
		"create",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			title: Options.text("title").pipe(Options.withDescription("Project title")),
			status: Options.text("status").pipe(
				Options.withDescription("Initial project status"),
				Options.optional,
			),
			area: Options.text("area").pipe(
				Options.withDescription("Project area"),
				Options.optional,
			),
			description: Options.text("description").pipe(
				Options.withDescription("Project description"),
				Options.optional,
			),
			tags: Options.text("tags").pipe(
				Options.withDescription("Comma-separated tags"),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const input = resolveCreateProjectInput(options);
				yield* execute(globalOptions, input);
			}),
	).pipe(Command.withDescription("Create a project"));

export const makeProjectUpdateCommand = <R, E>(
	execute: UpdateProjectExecute<R, E>,
) =>
	Command.make(
		"update",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Project ID")),
			title: Options.text("title").pipe(
				Options.withDescription("Updated project title"),
				Options.optional,
			),
			status: Options.text("status").pipe(
				Options.withDescription("Updated project status"),
				Options.optional,
			),
			area: Options.text("area").pipe(
				Options.withDescription("Updated project area"),
				Options.optional,
			),
			description: Options.text("description").pipe(
				Options.withDescription("Updated project description"),
				Options.optional,
			),
			tags: Options.text("tags").pipe(
				Options.withDescription("Updated comma-separated tags"),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const patch = resolveUpdateProjectPatch(options);
				yield* execute(globalOptions, options.id, patch);
			}),
	).pipe(Command.withDescription("Update a project by id"));

export const makeProjectDeleteCommand = <R, E>(
	execute: DeleteProjectExecute<R, E>,
) =>
	Command.make(
		"delete",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Project ID")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id);
			}),
	).pipe(Command.withDescription("Delete a project by id"));

export const makeProjectTasksCommand = <R, E>(
	execute: ProjectTasksExecute<R, E>,
) =>
	Command.make(
		"tasks",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			id: Options.text("id").pipe(Options.withDescription("Project ID")),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				yield* execute(globalOptions, options.id);
			}),
	).pipe(Command.withDescription("List tasks belonging to a project"));

export const makeProjectSummaryCommand = <R, E>(
	execute: ProjectSummaryExecute<R, E>,
) =>
	Command.make(
		"summary",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			status: Options.text("status").pipe(
				Options.withDescription("Filter by project status"),
				Options.optional,
			),
			area: Options.text("area").pipe(
				Options.withDescription("Filter by project area"),
				Options.optional,
			),
		},
		(options) =>
			Effect.gen(function* () {
				const globalOptions = resolveGlobalCliOptions({
					dataDir: options.dataDir,
					tasksFile: options.tasksFile,
					worklogFile: options.worklogFile,
					pretty: options.pretty,
				});
				const filters = resolveListProjectFilters(options);
				yield* execute(globalOptions, filters);
			}),
	).pipe(Command.withDescription("Show project summary with task counts"));

export const makeProjectCommand = <R, E>(
	execute: (options: GlobalCliOptions) => Effect.Effect<void, E, R>,
	executeList: ListProjectsExecute<R, E>,
	executeGet: GetProjectExecute<R, E>,
	executeCreate: CreateProjectExecute<R, E>,
	executeUpdate: UpdateProjectExecute<R, E>,
	executeDelete: DeleteProjectExecute<R, E>,
	executeTasks: ProjectTasksExecute<R, E>,
	executeSummary: ProjectSummaryExecute<R, E>,
) =>
	Command.make(
		"project",
		{ dataDir: dataDirOption, tasksFile: tasksFileOption, worklogFile: worklogFileOption, pretty: prettyOption },
		({ dataDir, tasksFile, worklogFile, pretty }) =>
			execute(resolveGlobalCliOptions({ dataDir, tasksFile, worklogFile, pretty })),
	).pipe(
		Command.withDescription("Manage projects"),
		Command.withSubcommands([
			makeProjectListCommand(executeList),
			makeProjectGetCommand(executeGet),
			makeProjectCreateCommand(executeCreate),
			makeProjectUpdateCommand(executeUpdate),
			makeProjectDeleteCommand(executeDelete),
			makeProjectTasksCommand(executeTasks),
			makeProjectSummaryCommand(executeSummary),
		]),
	);

export const makeWorkLogCommand = <R, E>(
	execute: WorkLogExecute<R, E>,
	executeList: ListWorkLogExecute<R, E>,
	executeCreate: CreateWorkLogExecute<R, E>,
	executeUpdate: UpdateWorkLogExecute<R, E>,
	executeDelete: DeleteWorkLogExecute<R, E>,
) =>
	Command.make(
		"worklog",
		{ dataDir: dataDirOption, tasksFile: tasksFileOption, worklogFile: worklogFileOption, pretty: prettyOption },
		({ dataDir, tasksFile, worklogFile, pretty }) =>
			execute(resolveGlobalCliOptions({ dataDir, tasksFile, worklogFile, pretty })),
	).pipe(
		Command.withDescription("Manage work log entries"),
		Command.withSubcommands([
			makeWorkLogListCommand(executeList),
			makeWorkLogCreateCommand(executeCreate),
			makeWorkLogUpdateCommand(executeUpdate),
			makeWorkLogDeleteCommand(executeDelete),
		]),
	);

export const makeTasksCommand = <R, E>(
	execute: (options: GlobalCliOptions) => Effect.Effect<void, E, R>,
	executeList: ListTasksExecute<R, E>,
	executeGet: GetTaskExecute<R, E>,
	executeCreate: CreateTaskExecute<R, E>,
	executeUpdate: UpdateTaskExecute<R, E>,
	executeDelete: DeleteTaskExecute<R, E>,
	executeHighlight: HighlightTaskExecute<R, E>,
	executeComplete: CompleteTaskExecute<R, E>,
	executeRecurrenceCheck: RecurrenceCheckExecute<R, E>,
	executePerspective: PerspectiveExecute<R, E>,
	executePerspectives: PerspectivesExecute<R, E>,
	executeWorkLog: WorkLogExecute<R, E>,
	executeWorkLogList: ListWorkLogExecute<R, E>,
	executeWorkLogCreate: CreateWorkLogExecute<R, E>,
	executeWorkLogUpdate: UpdateWorkLogExecute<R, E>,
	executeWorkLogDelete: DeleteWorkLogExecute<R, E>,
	executeMigrate: MigrateExecute<R, E>,
	executeProject: (options: GlobalCliOptions) => Effect.Effect<void, E, R>,
	executeProjectList: ListProjectsExecute<R, E>,
	executeProjectGet: GetProjectExecute<R, E>,
	executeProjectCreate: CreateProjectExecute<R, E>,
	executeProjectUpdate: UpdateProjectExecute<R, E>,
	executeProjectDelete: DeleteProjectExecute<R, E>,
	executeProjectTasks: ProjectTasksExecute<R, E>,
	executeProjectSummary: ProjectSummaryExecute<R, E>,
	executePromote: PromoteExecute<R, E>,
	executeAreas: AreasExecute<R, E>,
	executeContexts: ContextsExecute<R, E>,
	executeTemplate: TemplateExecute<R, E>,
	executeTemplateList: TemplateListExecute<R, E>,
	executeTemplateCreate: TemplateCreateExecute<R, E>,
	executeTemplateInstantiate: TemplateInstantiateExecute<R, E>,
	executeUnblock: UnblockTaskExecute<R, E>,
	executeChain: ChainExecute<R, E>,
	executeNext: NextTaskExecute<R, E>,
	executeDrop: DropTaskExecute<R, E>,
	executeToday: TodayExecute<R, E>,
) =>
	Command.make(
		"tasks",
		{ dataDir: dataDirOption, tasksFile: tasksFileOption, worklogFile: worklogFileOption, pretty: prettyOption },
		({ dataDir, tasksFile, worklogFile, pretty }) =>
			execute(resolveGlobalCliOptions({ dataDir, tasksFile, worklogFile, pretty })),
	).pipe(
		Command.withDescription(
			"Manage tasks and work-log entries via proseql (YAML, JSON, TOML, prose, and more).",
		),
		Command.withSubcommands([
			makeListCommand(executeList),
			makeGetCommand(executeGet),
			makeCreateCommand(executeCreate),
			makeUpdateCommand(executeUpdate),
			makeDeleteCommand(executeDelete),
			makeHighlightCommand(executeHighlight),
			makeCompleteCommand(executeComplete),
			makeRecurrenceCheckCommand(executeRecurrenceCheck),
			makePerspectiveCommand(executePerspective),
			makePerspectivesCommand(executePerspectives),
			makeWorkLogCommand(
				executeWorkLog,
				executeWorkLogList,
				executeWorkLogCreate,
				executeWorkLogUpdate,
				executeWorkLogDelete,
			),
			makeMigrateCommand(executeMigrate),
			makeProjectCommand(
				executeProject,
				executeProjectList,
				executeProjectGet,
				executeProjectCreate,
				executeProjectUpdate,
				executeProjectDelete,
				executeProjectTasks,
				executeProjectSummary,
			),
			makePromoteCommand(executePromote),
			makeAreasCommand(executeAreas),
			makeContextsCommand(executeContexts),
			makeTemplateCommand(
				executeTemplate,
				executeTemplateList,
				executeTemplateCreate,
				executeTemplateInstantiate,
			),
			makeUnblockCommand(executeUnblock),
			makeChainCommand(executeChain),
			makeNextCommand(executeNext),
			makeDropCommand(executeDrop),
			makeTodayCommand(executeToday),
		]),
	);

const noopExecute = (_options: GlobalCliOptions): Effect.Effect<void> =>
	Effect.void;

const noopListExecute = (
	_options: GlobalCliOptions,
	_filters: ListTasksFilters,
): Effect.Effect<void> => Effect.void;

const noopGetExecute = (
	_options: GlobalCliOptions,
	_id: string,
): Effect.Effect<void> => Effect.void;

const noopCreateExecute = (
	_options: GlobalCliOptions,
	_input: TaskCreateInput,
): Effect.Effect<void> => Effect.void;

const noopUpdateExecute = (
	_options: GlobalCliOptions,
	_id: string,
	_patch: TaskPatchInput,
): Effect.Effect<void> => Effect.void;

const noopDeleteExecute = (
	_options: GlobalCliOptions,
	_id: string,
): Effect.Effect<void> => Effect.void;

const noopHighlightExecute = (
	_options: GlobalCliOptions,
	_id: string,
): Effect.Effect<void> => Effect.void;

const noopCompleteExecute = (
	_options: GlobalCliOptions,
	_id: string,
): Effect.Effect<void> => Effect.void;

const noopRecurrenceCheckExecute = (
	_options: GlobalCliOptions,
): Effect.Effect<void> => Effect.void;

const noopPerspectiveExecute = (
	_options: GlobalCliOptions,
	_name: string,
): Effect.Effect<void> => Effect.void;

const noopPerspectivesExecute = (
	_options: GlobalCliOptions,
): Effect.Effect<void> => Effect.void;

const noopWorkLogExecute = (_options: GlobalCliOptions): Effect.Effect<void> =>
	Effect.void;

const noopWorkLogListExecute = (
	_options: GlobalCliOptions,
	_filters: ListWorkLogFilters,
): Effect.Effect<void> => Effect.void;

const noopWorkLogCreateExecute = (
	_options: GlobalCliOptions,
	_input: WorkLogCreateInput,
): Effect.Effect<void> => Effect.void;

const noopWorkLogUpdateExecute = (
	_options: GlobalCliOptions,
	_id: string,
	_patch: WorkLogPatchInput,
): Effect.Effect<void> => Effect.void;

const noopWorkLogDeleteExecute = (
	_options: GlobalCliOptions,
	_id: string,
): Effect.Effect<void> => Effect.void;

const noopMigrateExecute = (
	_options: GlobalCliOptions,
	_fromDir: string,
): Effect.Effect<void> => Effect.void;

const noopProjectExecute = (_options: GlobalCliOptions): Effect.Effect<void> =>
	Effect.void;

const noopProjectListExecute = (
	_options: GlobalCliOptions,
	_filters: ListProjectsFilters,
): Effect.Effect<void> => Effect.void;

const noopProjectGetExecute = (
	_options: GlobalCliOptions,
	_id: string,
): Effect.Effect<void> => Effect.void;

const noopProjectCreateExecute = (
	_options: GlobalCliOptions,
	_input: ProjectCreateInputType,
): Effect.Effect<void> => Effect.void;

const noopProjectUpdateExecute = (
	_options: GlobalCliOptions,
	_id: string,
	_patch: ProjectPatchType,
): Effect.Effect<void> => Effect.void;

const noopProjectDeleteExecute = (
	_options: GlobalCliOptions,
	_id: string,
): Effect.Effect<void> => Effect.void;

const noopProjectTasksExecute = (
	_options: GlobalCliOptions,
	_id: string,
): Effect.Effect<void> => Effect.void;

const noopProjectSummaryExecute = (
	_options: GlobalCliOptions,
	_filters: ListProjectsFilters,
): Effect.Effect<void> => Effect.void;

const noopPromoteExecute = (
	_options: GlobalCliOptions,
	_id: string,
	_index: number,
): Effect.Effect<void> => Effect.void;

const noopAreasExecute = (
	_options: GlobalCliOptions,
): Effect.Effect<void> => Effect.void;

const noopContextsExecute = (
	_options: GlobalCliOptions,
): Effect.Effect<void> => Effect.void;

const noopTemplateExecute = (
	_options: GlobalCliOptions,
): Effect.Effect<void> => Effect.void;

const noopTemplateListExecute = (
	_options: GlobalCliOptions,
): Effect.Effect<void> => Effect.void;

const noopTemplateCreateExecute = (
	_options: GlobalCliOptions,
	_input: TaskCreateInput,
): Effect.Effect<void> => Effect.void;

const noopTemplateInstantiateExecute = (
	_options: GlobalCliOptions,
	_templateId: string,
	_overrides: {
		readonly title?: string;
		readonly due?: string;
		readonly defer_until?: string;
		readonly status?: string;
		readonly projects?: ReadonlyArray<string>;
	},
): Effect.Effect<void> => Effect.void;

const noopUnblockExecute = (
	_options: GlobalCliOptions,
	_id: string,
): Effect.Effect<void> => Effect.void;

const noopChainExecute = (
	_options: GlobalCliOptions,
	_id: string,
): Effect.Effect<void> => Effect.void;

const noopNextExecute = (
	_options: GlobalCliOptions,
	_energy?: string,
): Effect.Effect<void> => Effect.void;

const noopDropExecute = (
	_options: GlobalCliOptions,
	_id: string,
): Effect.Effect<void> => Effect.void;

const noopTodayExecute = (
	_options: GlobalCliOptions,
): Effect.Effect<void> => Effect.void;

const defaultListExecute: ListTasksExecute<never, string> = (
	options,
	filters,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const tasks = yield* repository.listTasks(filters);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(tasks, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultGetExecute: GetTaskExecute<never, string> = (options, id) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const task = yield* repository.getTask(id);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(task, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultCreateExecute: CreateTaskExecute<never, string> = (
	options,
	input,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const task = yield* repository.createTask(input);

		for (const projectId of task.projects) {
			const projectExists = yield* Effect.catchAll(
				Effect.map(repository.getProject(projectId), () => true),
				() => Effect.succeed(false),
			);
			if (!projectExists) {
				yield* Effect.sync(() => {
					process.stderr.write(
						`Warning: project "${projectId}" does not exist as a registered project\n`,
					);
				});
			}
		}

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(task, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultUpdateExecute: UpdateTaskExecute<never, string> = (
	options,
	id,
	patch,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const task = yield* repository.updateTask(id, patch);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(task, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultDeleteExecute: DeleteTaskExecute<never, string> = (options, id) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const result = yield* repository.deleteTask(id);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(result, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultHighlightExecute: HighlightTaskExecute<never, string> = (
	options,
	id,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const task = yield* repository.setDailyHighlight(id);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(task, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultCompleteExecute: CompleteTaskExecute<never, string> = (
	options,
	id,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const task = yield* repository.completeTask(id);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(task, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultRecurrenceCheckExecute: RecurrenceCheckExecute<never, string> = (
	options,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const result = yield* repository.processDueRecurrences(new Date());

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(result, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultPerspectiveExecute: PerspectiveExecute<never, string> = (
	options,
	name,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const tasks = yield* repository.listTasks();
		const config = yield* loadPerspectiveConfig(options.dataDir);
		const perspective = config[name];

		if (perspective === undefined) {
			return yield* Effect.fail(`Perspective not found: ${name}`);
		}

		const projected = applyPerspectiveToTasks(tasks, perspective);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(projected, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultPerspectivesExecute: PerspectivesExecute<never, string> = (
	options,
) =>
	Effect.gen(function* () {
		const config = yield* loadPerspectiveConfig(options.dataDir);
		const names = Object.keys(config).sort((a, b) => a.localeCompare(b));

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(names, options.pretty)}\n`);
		});
	});

const defaultWorkLogListExecute: ListWorkLogExecute<never, string> = (
	options,
	filters,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const entries = yield* repository.listWorkLog(filters);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(entries, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultWorkLogCreateExecute: CreateWorkLogExecute<never, string> = (
	options,
	input,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const entry = yield* repository.createWorkLogEntry(input);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(entry, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultWorkLogUpdateExecute: UpdateWorkLogExecute<never, string> = (
	options,
	id,
	patch,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const entry = yield* repository.updateWorkLogEntry(id, patch);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(entry, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultWorkLogDeleteExecute: DeleteWorkLogExecute<never, string> = (
	options,
	id,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const result = yield* repository.deleteWorkLogEntry(id);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(result, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultProjectListExecute: ListProjectsExecute<never, string> = (
	options,
	filters,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const projects = yield* repository.listProjects(filters);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(projects, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultProjectGetExecute: GetProjectExecute<never, string> = (
	options,
	id,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const project = yield* repository.getProject(id);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(project, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultProjectCreateExecute: CreateProjectExecute<never, string> = (
	options,
	input,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const project = yield* repository.createProject(input);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(project, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultProjectUpdateExecute: UpdateProjectExecute<never, string> = (
	options,
	id,
	patch,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const project = yield* repository.updateProject(id, patch);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(project, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultProjectDeleteExecute: DeleteProjectExecute<never, string> = (
	options,
	id,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;

		const referencingTasks = yield* repository.listTasks({ project: id });
		if (referencingTasks.length > 0) {
			yield* Effect.sync(() => {
				process.stderr.write(
					`Warning: ${referencingTasks.length} task(s) still reference project "${id}"\n`,
				);
			});
		}

		const result = yield* repository.deleteProject(id);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(result, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultProjectTasksExecute: ProjectTasksExecute<never, string> = (
	options,
	id,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const tasks = yield* repository.listTasks({ project: id });

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(tasks, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultProjectSummaryExecute: ProjectSummaryExecute<never, string> = (
	options,
	filters,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const projects = yield* repository.listProjects(filters);
		const tasks = yield* repository.listTasks();

		const summary = projects.map((project) => {
			const projectTasks = tasks.filter((t) => t.projects.includes(project.id));
			const statusCounts: Record<string, number> = {};
			for (const t of projectTasks) {
				statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
			}
			return {
				id: project.id,
				title: project.title,
				status: project.status,
				area: project.area,
				task_count: projectTasks.length,
				task_status_counts: statusCounts,
			};
		});

		const unregisteredProjects = new Set<string>();
		for (const task of tasks) {
			for (const projectId of task.projects) {
				if (!projects.some((p) => p.id === projectId)) {
					unregisteredProjects.add(projectId);
				}
			}
		}

		const result = {
			projects: summary,
			...(unregisteredProjects.size > 0
				? { unregistered: Array.from(unregisteredProjects).sort() }
				: {}),
		};

		if (unregisteredProjects.size > 0) {
			process.stderr.write(
				`Warning: ${unregisteredProjects.size} unregistered project(s) found in tasks: ${Array.from(unregisteredProjects).sort().join(", ")}\n`,
			);
		}

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(result, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultMigrateExecute: MigrateExecute<never, string> = (
	options,
	fromDir,
) =>
	Effect.gen(function* () {
		const oldLayer = TaskRepositoryLive({ dataDir: fromDir });
		const newLayer = makeRepositoryLayer(options);

		const oldRepo = yield* Effect.provide(
			TaskRepository,
			oldLayer,
		);
		const newRepo = yield* Effect.provide(
			TaskRepository,
			newLayer,
		);

		const tasks = yield* oldRepo.listTasks();
		const workLog = yield* oldRepo.listWorkLog();

		let taskCount = 0;
		for (const task of tasks) {
			yield* newRepo.importTask(task);
			taskCount++;
		}

		let workLogCount = 0;
		for (const entry of workLog) {
			yield* newRepo.importWorkLogEntry(entry);
			workLogCount++;
		}

		yield* Effect.sync(() => {
			process.stdout.write(
				`${formatOutput({ migrated: { tasks: taskCount, workLogEntries: workLogCount } }, options.pretty)}\n`,
			);
		});
	});

const defaultPromoteExecute: PromoteExecute<never, string> = (
	options,
	id,
	index,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const newTask = yield* promoteSubtask(repository, id, index);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(newTask, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultAreasExecute: AreasExecute<never, string> = (options) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const tasks = yield* repository.listTasks();
		const projects = yield* repository.listProjects();
		const areas = listAreas(tasks, projects);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(areas, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultContextsExecute: ContextsExecute<never, string> = (options) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const tasks = yield* repository.listTasks();
		const contexts = listContexts(tasks);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(contexts, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultTemplateListExecute: TemplateListExecute<never, string> = (
	options,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const tasks = yield* repository.listTasks({ include_templates: true });
		const templates = tasks.filter((t) => t.is_template === true);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(templates, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultTemplateCreateExecute: TemplateCreateExecute<never, string> = (
	options,
	input,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const task = yield* repository.createTask(input);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(task, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultTemplateInstantiateExecute: TemplateInstantiateExecute<
	never,
	string
> = (options, templateId, overrides) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const task = yield* repository.instantiateTemplate(templateId, overrides);

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(task, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultUnblockExecute: UnblockTaskExecute<never, string> = (
	options,
	id,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const completed = yield* repository.completeTask(id);
		const allTasks = yield* repository.listTasks();
		const unblocked = allTasks.filter(
			(t) => t.blocked_by.includes(id) && isUnblocked(t, allTasks),
		);

		yield* Effect.sync(() => {
			process.stdout.write(
				`${formatOutput({ completed, unblocked }, options.pretty)}\n`,
			);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultChainExecute: ChainExecute<never, string> = (options, id) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const allTasks = yield* repository.listTasks();
		const chain = buildDependencyChain(id, allTasks);

		yield* Effect.sync(() => {
			process.stdout.write(
				`${formatOutput(chain, options.pretty)}\n`,
			);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultNextExecute: NextTaskExecute<never, string> = (
	options,
	energy,
) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const allTasks = yield* repository.listTasks({ status: "active" });
		const today = new Date().toISOString().slice(0, 10);
		const deferredPredicate = isDeferred(today);

		const candidates = allTasks.filter(
			(t) =>
				isUnblocked(t, allTasks) &&
				!deferredPredicate(t) &&
				(energy === undefined || t.energy === energy),
		);

		candidates.sort(byUrgencyDesc);
		const next = candidates.length > 0 ? candidates[0] : null;

		yield* Effect.sync(() => {
			process.stdout.write(
				`${formatOutput(next, options.pretty)}\n`,
			);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultDropExecute: DropTaskExecute<never, string> = (options, id) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const task = yield* repository.updateTask(id, { status: "dropped" });

		yield* Effect.sync(() => {
			process.stdout.write(`${formatOutput(task, options.pretty)}\n`);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

const defaultTodayExecute: TodayExecute<never, string> = (options) =>
	Effect.gen(function* () {
		const repository = yield* TaskRepository;
		const highlight = yield* repository.getDailyHighlight();
		const allTasks = yield* repository.listTasks({ status: "active" });
		const today = new Date().toISOString().slice(0, 10);

		const due = allTasks.filter(
			(t) => t.due !== null && t.due <= today,
		);
		const undeferred = allTasks.filter(
			(t) => t.defer_until !== null && t.defer_until <= today,
		);

		yield* Effect.sync(() => {
			process.stdout.write(
				`${formatOutput({ highlight, due, undeferred }, options.pretty)}\n`,
			);
		});
	}).pipe(Effect.provide(makeRepositoryLayer(options)));

export const makeCli = <R, E>(
	execute: (options: GlobalCliOptions) => Effect.Effect<void, E, R>,
	executeList: ListTasksExecute<R, E> = noopListExecute as ListTasksExecute<
		R,
		E
	>,
	executeGet: GetTaskExecute<R, E> = noopGetExecute as GetTaskExecute<R, E>,
	executeCreate: CreateTaskExecute<
		R,
		E
	> = noopCreateExecute as CreateTaskExecute<R, E>,
	executeUpdate: UpdateTaskExecute<
		R,
		E
	> = noopUpdateExecute as UpdateTaskExecute<R, E>,
	executeDelete: DeleteTaskExecute<
		R,
		E
	> = noopDeleteExecute as DeleteTaskExecute<R, E>,
	executeHighlight: HighlightTaskExecute<
		R,
		E
	> = noopHighlightExecute as HighlightTaskExecute<R, E>,
	executeComplete: CompleteTaskExecute<
		R,
		E
	> = noopCompleteExecute as CompleteTaskExecute<R, E>,
	executeRecurrenceCheck: RecurrenceCheckExecute<
		R,
		E
	> = noopRecurrenceCheckExecute as RecurrenceCheckExecute<R, E>,
	executePerspective: PerspectiveExecute<
		R,
		E
	> = noopPerspectiveExecute as PerspectiveExecute<R, E>,
	executePerspectives: PerspectivesExecute<
		R,
		E
	> = noopPerspectivesExecute as PerspectivesExecute<R, E>,
	executeWorkLog: WorkLogExecute<R, E> = noopWorkLogExecute as WorkLogExecute<
		R,
		E
	>,
	executeWorkLogList: ListWorkLogExecute<
		R,
		E
	> = noopWorkLogListExecute as ListWorkLogExecute<R, E>,
	executeWorkLogCreate: CreateWorkLogExecute<
		R,
		E
	> = noopWorkLogCreateExecute as CreateWorkLogExecute<R, E>,
	executeWorkLogUpdate: UpdateWorkLogExecute<
		R,
		E
	> = noopWorkLogUpdateExecute as UpdateWorkLogExecute<R, E>,
	executeWorkLogDelete: DeleteWorkLogExecute<
		R,
		E
	> = noopWorkLogDeleteExecute as DeleteWorkLogExecute<R, E>,
	executeMigrate: MigrateExecute<R, E> = noopMigrateExecute as MigrateExecute<
		R,
		E
	>,
	executeProject: (
		options: GlobalCliOptions,
	) => Effect.Effect<void, E, R> = noopProjectExecute as (
		options: GlobalCliOptions,
	) => Effect.Effect<void, E, R>,
	executeProjectList: ListProjectsExecute<
		R,
		E
	> = noopProjectListExecute as ListProjectsExecute<R, E>,
	executeProjectGet: GetProjectExecute<
		R,
		E
	> = noopProjectGetExecute as GetProjectExecute<R, E>,
	executeProjectCreate: CreateProjectExecute<
		R,
		E
	> = noopProjectCreateExecute as CreateProjectExecute<R, E>,
	executeProjectUpdate: UpdateProjectExecute<
		R,
		E
	> = noopProjectUpdateExecute as UpdateProjectExecute<R, E>,
	executeProjectDelete: DeleteProjectExecute<
		R,
		E
	> = noopProjectDeleteExecute as DeleteProjectExecute<R, E>,
	executeProjectTasks: ProjectTasksExecute<
		R,
		E
	> = noopProjectTasksExecute as ProjectTasksExecute<R, E>,
	executeProjectSummary: ProjectSummaryExecute<
		R,
		E
	> = noopProjectSummaryExecute as ProjectSummaryExecute<R, E>,
	executePromote: PromoteExecute<R, E> = noopPromoteExecute as PromoteExecute<
		R,
		E
	>,
	executeAreas: AreasExecute<R, E> = noopAreasExecute as AreasExecute<R, E>,
	executeContexts: ContextsExecute<R, E> = noopContextsExecute as ContextsExecute<R, E>,
	executeTemplate: TemplateExecute<R, E> = noopTemplateExecute as TemplateExecute<R, E>,
	executeTemplateList: TemplateListExecute<R, E> = noopTemplateListExecute as TemplateListExecute<R, E>,
	executeTemplateCreate: TemplateCreateExecute<R, E> = noopTemplateCreateExecute as TemplateCreateExecute<R, E>,
	executeTemplateInstantiate: TemplateInstantiateExecute<R, E> = noopTemplateInstantiateExecute as TemplateInstantiateExecute<R, E>,
	executeUnblock: UnblockTaskExecute<R, E> = noopUnblockExecute as UnblockTaskExecute<R, E>,
	executeChain: ChainExecute<R, E> = noopChainExecute as ChainExecute<R, E>,
	executeNext: NextTaskExecute<R, E> = noopNextExecute as NextTaskExecute<R, E>,
	executeDrop: DropTaskExecute<R, E> = noopDropExecute as DropTaskExecute<R, E>,
	executeToday: TodayExecute<R, E> = noopTodayExecute as TodayExecute<R, E>,
) =>
	Command.run(
		makeTasksCommand(
			execute,
			executeList,
			executeGet,
			executeCreate,
			executeUpdate,
			executeDelete,
			executeHighlight,
			executeComplete,
			executeRecurrenceCheck,
			executePerspective,
			executePerspectives,
			executeWorkLog,
			executeWorkLogList,
			executeWorkLogCreate,
			executeWorkLogUpdate,
			executeWorkLogDelete,
			executeMigrate,
			executeProject,
			executeProjectList,
			executeProjectGet,
			executeProjectCreate,
			executeProjectUpdate,
			executeProjectDelete,
			executeProjectTasks,
			executeProjectSummary,
			executePromote,
			executeAreas,
			executeContexts,
			executeTemplate,
			executeTemplateList,
			executeTemplateCreate,
			executeTemplateInstantiate,
			executeUnblock,
			executeChain,
			executeNext,
			executeDrop,
			executeToday,
		),
		{
			name: "Tashks CLI",
			version: "v0.1.0",
		},
	);

export const cli = makeCli(
	noopExecute,
	defaultListExecute,
	defaultGetExecute,
	defaultCreateExecute,
	defaultUpdateExecute,
	defaultDeleteExecute,
	defaultHighlightExecute,
	defaultCompleteExecute,
	defaultRecurrenceCheckExecute,
	defaultPerspectiveExecute,
	defaultPerspectivesExecute,
	noopWorkLogExecute,
	defaultWorkLogListExecute,
	defaultWorkLogCreateExecute,
	defaultWorkLogUpdateExecute,
	defaultWorkLogDeleteExecute,
	defaultMigrateExecute,
	noopProjectExecute,
	defaultProjectListExecute,
	defaultProjectGetExecute,
	defaultProjectCreateExecute,
	defaultProjectUpdateExecute,
	defaultProjectDeleteExecute,
	defaultProjectTasksExecute,
	defaultProjectSummaryExecute,
	defaultPromoteExecute,
	defaultAreasExecute,
	defaultContextsExecute,
	noopTemplateExecute,
	defaultTemplateListExecute,
	defaultTemplateCreateExecute,
	defaultTemplateInstantiateExecute,
	defaultUnblockExecute,
	defaultChainExecute,
	defaultNextExecute,
	defaultDropExecute,
	defaultTodayExecute,
);

export const runCli = (argv: ReadonlyArray<string> = process.argv) => cli(argv);

if (import.meta.main) {
	runCli().pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
}
