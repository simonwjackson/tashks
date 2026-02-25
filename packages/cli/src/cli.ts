import * as Command from "@effect/cli/Command";
import * as Options from "@effect/cli/Options";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import {
	TaskRepository,
	TaskRepositoryLive,
	type ListTasksFilters,
} from "@tasks/core/dist/src/repository.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

export interface GlobalCliOptionsInput {
	readonly dataDir: Option.Option<string>;
	readonly pretty: boolean;
}

export interface GlobalCliOptions {
	readonly dataDir: string;
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

export type ListTasksExecute<R, E> = (
	options: GlobalCliOptions,
	filters: ListTasksFilters,
) => Effect.Effect<void, E, R>;

export const defaultDataDir = (
	env: NodeJS.ProcessEnv = process.env,
): string => {
	const home = env.HOME;
	return home !== undefined && home.length > 0
		? `${home}/.local/share/tasks`
		: ".local/share/tasks";
};

export const resolveGlobalCliOptions = (
	options: GlobalCliOptionsInput,
	env: NodeJS.ProcessEnv = process.env,
): GlobalCliOptions => ({
	dataDir: Option.getOrElse(options.dataDir, () => defaultDataDir(env)),
	pretty: options.pretty,
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

export const dataDirOption = Options.text("data-dir").pipe(
	Options.withDescription("Override the tasks data directory"),
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

export const makeListCommand = <R, E>(execute: ListTasksExecute<R, E>) =>
	Command.make(
		"list",
		{
			dataDir: dataDirOption,
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
					pretty: options.pretty,
				});
				const filters = resolveListTaskFilters(options);
				yield* execute(globalOptions, filters);
			}),
	).pipe(Command.withDescription("List tasks with optional filters"));

export const makeTasksCommand = <R, E>(
	execute: (options: GlobalCliOptions) => Effect.Effect<void, E, R>,
	executeList: ListTasksExecute<R, E>,
) =>
	Command.make(
		"tasks",
		{ dataDir: dataDirOption, pretty: prettyOption },
		({ dataDir, pretty }) =>
			execute(resolveGlobalCliOptions({ dataDir, pretty })),
	).pipe(
		Command.withDescription(
			"Manage tasks and work-log entries stored as YAML files.",
		),
		Command.withSubcommands([makeListCommand(executeList)]),
	);

const noopExecute = (_options: GlobalCliOptions): Effect.Effect<void> =>
	Effect.void;

const noopListExecute = (
	_options: GlobalCliOptions,
	_filters: ListTasksFilters,
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
	}).pipe(Effect.provide(TaskRepositoryLive({ dataDir: options.dataDir })));

export const makeCli = <R, E>(
	execute: (options: GlobalCliOptions) => Effect.Effect<void, E, R>,
	executeList: ListTasksExecute<R, E> = noopListExecute as ListTasksExecute<
		R,
		E
	>,
) =>
	Command.run(makeTasksCommand(execute, executeList), {
		name: "Tasks CLI",
		version: "v0.1.0",
	});

export const cli = makeCli(noopExecute, defaultListExecute);

export const runCli = (argv: ReadonlyArray<string> = process.argv) => cli(argv);

if (import.meta.main) {
	runCli().pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
}
