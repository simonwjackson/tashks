import * as Command from "@effect/cli/Command";
import * as Options from "@effect/cli/Options";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
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

export const dataDirOption = Options.text("data-dir").pipe(
	Options.withDescription("Override the tasks data directory"),
	Options.optional,
);

export const prettyOption = Options.boolean("pretty").pipe(
	Options.withDescription("Pretty-print JSON output"),
);

export const makeTasksCommand = <R, E>(
	execute: (options: GlobalCliOptions) => Effect.Effect<void, E, R>,
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
	);

const noopExecute = (_options: GlobalCliOptions): Effect.Effect<void> =>
	Effect.void;

export const makeCli = <R, E>(
	execute: (options: GlobalCliOptions) => Effect.Effect<void, E, R>,
) =>
	Command.run(makeTasksCommand(execute), {
		name: "Tasks CLI",
		version: "v0.1.0",
	});

export const cli = makeCli(noopExecute);

export const runCli = (argv: ReadonlyArray<string> = process.argv) => cli(argv);

if (import.meta.main) {
	runCli().pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
}
