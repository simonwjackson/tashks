#!/usr/bin/env node
import { dirname, join } from "node:path";
import * as Args from "@effect/cli/Args";
import * as Command from "@effect/cli/Command";
import * as Options from "@effect/cli/Options";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import {
	TaskRepository,
	TaskRepositoryLive,
	type ListTasksFilters,
	type TaskRepositoryService,
} from "@tashks/core/repository";
import { ProseqlRepositoryLive } from "@tashks/core/proseql-repository";
import {
	applyPerspectiveToTasks,
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
	readonly area: Option.Option<NonNullable<TaskCreateInput["area"]>>;
	readonly project: Option.Option<string>;
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
}

export interface UpdateTaskCliOptionsInput {
	readonly title: Option.Option<string>;
	readonly status: Option.Option<NonNullable<TaskPatchInput["status"]>>;
	readonly area: Option.Option<NonNullable<TaskPatchInput["area"]>>;
	readonly project: Option.Option<string>;
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

	return {
		...(status !== undefined ? { status } : {}),
		...(area !== undefined ? { area } : {}),
		...(project !== undefined ? { project } : {}),
		...(tags !== undefined ? { tags } : {}),
		...(dueBefore !== undefined ? { due_before: dueBefore } : {}),
		...(dueAfter !== undefined ? { due_after: dueAfter } : {}),
		...(options.unblockedOnly ? { unblocked_only: true } : {}),
		...(date !== undefined ? { date } : {}),
	};
};

export const resolveCreateTaskInput = (
	options: CreateTaskCliOptionsInput,
): TaskCreateInput => {
	const status = toUndefined(options.status);
	const area = toUndefined(options.area);
	const project = toUndefined(options.project);
	const tags = parseTagFilter(options.tags);
	const due = toUndefined(options.due);
	const deferUntil = toUndefined(options.deferUntil);
	const urgency = toUndefined(options.urgency);
	const energy = toUndefined(options.energy);
	const context = toUndefined(options.context);
	const recurrence = toUndefined(options.recurrence);
	const recurrenceTrigger = toUndefined(options.recurrenceTrigger);
	const recurrenceStrategy = toUndefined(options.recurrenceStrategy);

	return {
		title: options.title,
		...(status !== undefined ? { status } : {}),
		...(area !== undefined ? { area } : {}),
		...(project !== undefined ? { project } : {}),
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
	};
};

export const resolveUpdateTaskPatch = (
	options: UpdateTaskCliOptionsInput,
): TaskPatchInput => {
	const title = toUndefined(options.title);
	const status = toUndefined(options.status);
	const area = toUndefined(options.area);
	const project = toUndefined(options.project);
	const tags = parseTagFilter(options.tags);
	const due = toUndefined(options.due);
	const deferUntil = toUndefined(options.deferUntil);
	const urgency = toUndefined(options.urgency);
	const energy = toUndefined(options.energy);
	const context = toUndefined(options.context);
	const recurrence = toUndefined(options.recurrence);
	const recurrenceTrigger = toUndefined(options.recurrenceTrigger);
	const recurrenceStrategy = toUndefined(options.recurrenceStrategy);

	return {
		...(title !== undefined ? { title } : {}),
		...(status !== undefined ? { status } : {}),
		...(area !== undefined ? { area } : {}),
		...(project !== undefined ? { project } : {}),
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

const taskStatusChoices = [
	"active",
	"backlog",
	"blocked",
	"done",
	"dropped",
	"on-hold",
] as const satisfies ReadonlyArray<NonNullable<ListTasksFilters["status"]>>;

const taskAreaChoices = [
	"health",
	"infrastructure",
	"work",
	"personal",
	"blog",
	"code",
	"home",
	"side-projects",
] as const satisfies ReadonlyArray<NonNullable<ListTasksFilters["area"]>>;

const taskUrgencyChoices = [
	"low",
	"medium",
	"high",
	"urgent",
	"critical",
] as const satisfies ReadonlyArray<NonNullable<TaskCreateInput["urgency"]>>;

const taskEnergyChoices = [
	"low",
	"medium",
	"high",
] as const satisfies ReadonlyArray<NonNullable<TaskCreateInput["energy"]>>;

const recurrenceTriggerChoices = [
	"clock",
	"completion",
] as const satisfies ReadonlyArray<
	NonNullable<TaskCreateInput["recurrence_trigger"]>
>;

const recurrenceStrategyChoices = [
	"replace",
	"accumulate",
] as const satisfies ReadonlyArray<
	NonNullable<TaskCreateInput["recurrence_strategy"]>
>;

export const makeListCommand = <R, E>(execute: ListTasksExecute<R, E>) =>
	Command.make(
		"list",
		{
			dataDir: dataDirOption,
			tasksFile: tasksFileOption,
			worklogFile: worklogFileOption,
			pretty: prettyOption,
			status: Options.choice("status", taskStatusChoices).pipe(
				Options.withDescription("Filter by task status"),
				Options.optional,
			),
			area: Options.choice("area", taskAreaChoices).pipe(
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
			id: Args.text({ name: "id" }),
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
			status: Options.choice("status", taskStatusChoices).pipe(
				Options.withDescription("Initial task status"),
				Options.optional,
			),
			area: Options.choice("area", taskAreaChoices).pipe(
				Options.withDescription("Task area"),
				Options.optional,
			),
			project: Options.text("project").pipe(
				Options.withDescription("Project label"),
				Options.optional,
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
			urgency: Options.choice("urgency", taskUrgencyChoices).pipe(
				Options.withDescription("Urgency level"),
				Options.optional,
			),
			energy: Options.choice("energy", taskEnergyChoices).pipe(
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
			recurrenceTrigger: Options.choice(
				"recurrence-trigger",
				recurrenceTriggerChoices,
			).pipe(
				Options.withDescription("Recurrence trigger mode"),
				Options.optional,
			),
			recurrenceStrategy: Options.choice(
				"recurrence-strategy",
				recurrenceStrategyChoices,
			).pipe(
				Options.withDescription(
					"Clock recurrence strategy for unfinished tasks",
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
			id: Args.text({ name: "id" }),
			title: Options.text("title").pipe(
				Options.withDescription("Updated task title"),
				Options.optional,
			),
			status: Options.choice("status", taskStatusChoices).pipe(
				Options.withDescription("Updated task status"),
				Options.optional,
			),
			area: Options.choice("area", taskAreaChoices).pipe(
				Options.withDescription("Updated task area"),
				Options.optional,
			),
			project: Options.text("project").pipe(
				Options.withDescription("Updated project label"),
				Options.optional,
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
			urgency: Options.choice("urgency", taskUrgencyChoices).pipe(
				Options.withDescription("Updated urgency level"),
				Options.optional,
			),
			energy: Options.choice("energy", taskEnergyChoices).pipe(
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
			recurrenceTrigger: Options.choice(
				"recurrence-trigger",
				recurrenceTriggerChoices,
			).pipe(
				Options.withDescription("Updated recurrence trigger mode"),
				Options.optional,
			),
			recurrenceStrategy: Options.choice(
				"recurrence-strategy",
				recurrenceStrategyChoices,
			).pipe(
				Options.withDescription("Updated clock recurrence strategy"),
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
			id: Args.text({ name: "id" }),
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
			id: Args.text({ name: "id" }),
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
			id: Args.text({ name: "id" }),
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
			name: Args.text({ name: "name" }),
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
			id: Args.text({ name: "id" }),
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
			id: Args.text({ name: "id" }),
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
);

export const runCli = (argv: ReadonlyArray<string> = process.argv) => cli(argv);

if (import.meta.main) {
	runCli().pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
}
