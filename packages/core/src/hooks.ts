import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Task as TaskSchema, type Task } from "./schema.js";

const decodeTask = Schema.decodeUnknownSync(TaskSchema);

const toErrorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export type HookEvent = "create" | "modify" | "complete" | "delete";

export interface HookDiscoveryOptions {
	readonly hooksDir?: string;
	readonly env?: NodeJS.ProcessEnv;
}

export interface HookRuntimeOptions extends HookDiscoveryOptions {
	readonly dataDir: string;
}

type MutatingHookEvent = "create" | "modify";

export const defaultHooksDir = (
	env: NodeJS.ProcessEnv = process.env,
): string => {
	const xdgConfigHome = env.XDG_CONFIG_HOME;
	if (xdgConfigHome !== undefined && xdgConfigHome.length > 0) {
		return join(xdgConfigHome, "tashks", "hooks");
	}

	const home = env.HOME;
	return home !== undefined && home.length > 0
		? join(home, ".config", "tashks", "hooks")
		: join(".config", "tashks", "hooks");
};

const hookNamePattern = (event: HookEvent): RegExp =>
	new RegExp(`^on-${event}(?:\\..+)?$`);

const isHookCandidate = (event: HookEvent, fileName: string): boolean =>
	hookNamePattern(event).test(fileName);

const isExecutableFile = (path: string): Effect.Effect<boolean, string> =>
	Effect.tryPromise({
		try: async () => {
			try {
				await access(path, fsConstants.X_OK);
				return true;
			} catch (error) {
				if (
					error !== null &&
					typeof error === "object" &&
					"code" in error &&
					(error.code === "EACCES" ||
						error.code === "EPERM" ||
						error.code === "ENOENT")
				) {
					return false;
				}
				throw error;
			}
		},
		catch: (error) =>
			`TaskRepository failed to inspect hook executable bit for ${path}: ${toErrorMessage(error)}`,
	});

export const discoverHooksForEvent = (
	event: HookEvent,
	options: HookDiscoveryOptions = {},
): Effect.Effect<Array<string>, string> => {
	const hooksDir = options.hooksDir ?? defaultHooksDir(options.env);

	return Effect.gen(function* () {
		const entries = yield* Effect.tryPromise({
			try: () =>
				readdir(hooksDir, { withFileTypes: true }).catch((error: unknown) => {
					if (
						error !== null &&
						typeof error === "object" &&
						"code" in error &&
						error.code === "ENOENT"
					) {
						return [];
					}
					throw error;
				}),
			catch: (error) =>
				`TaskRepository failed to read hooks directory ${hooksDir}: ${toErrorMessage(error)}`,
		});

		const candidatePaths = entries
			.filter(
				(entry) =>
					(entry.isFile() || entry.isSymbolicLink()) &&
					isHookCandidate(event, entry.name),
			)
			.map((entry) => join(hooksDir, entry.name))
			.sort((a, b) => a.localeCompare(b));

		const discovered: Array<string> = [];

		for (const candidatePath of candidatePaths) {
			const executable = yield* isExecutableFile(candidatePath);
			if (executable) {
				discovered.push(candidatePath);
			}
		}

		return discovered;
	});
};

const parseTaskFromHookStdout = (
	event: MutatingHookEvent,
	hookPath: string,
	stdout: string,
): Effect.Effect<Task, string> =>
	Effect.try({
		try: () => decodeTask(JSON.parse(stdout)),
		catch: (error) =>
			`TaskRepository hook ${hookPath} returned invalid JSON for on-${event}: ${toErrorMessage(error)}`,
	});

export const buildHookEnv = (
	event: HookEvent,
	taskId: string,
	options: HookRuntimeOptions,
): NodeJS.ProcessEnv => ({
	...process.env,
	...options.env,
	TASHKS_EVENT: event,
	TASHKS_ID: taskId,
	TASHKS_DATA_DIR: options.dataDir,
});

export const runHookExecutable = (
	hookPath: string,
	stdin: string,
	env: NodeJS.ProcessEnv,
): Effect.Effect<string, string> =>
	Effect.gen(function* () {
		const result = yield* Effect.try({
			try: () =>
				spawnSync(hookPath, [], {
					input: stdin,
					encoding: "utf8",
					stdio: ["pipe", "pipe", "pipe"],
					env,
				}),
			catch: (error) =>
				`TaskRepository failed to execute hook ${hookPath}: ${toErrorMessage(error)}`,
		});

		if (result.error !== undefined) {
			return yield* Effect.fail(
				`TaskRepository failed to execute hook ${hookPath}: ${toErrorMessage(result.error)}`,
			);
		}

		if (result.status !== 0) {
			const stderr =
				typeof result.stderr === "string" ? result.stderr.trim() : "";
			const signal =
				result.signal !== null ? `terminated by signal ${result.signal}` : null;
			const status =
				result.status === null
					? "unknown"
					: `exited with code ${result.status}`;
			const details = stderr.length > 0 ? stderr : (signal ?? status);

			return yield* Effect.fail(
				`TaskRepository hook ${hookPath} failed: ${details}`,
			);
		}

		return typeof result.stdout === "string" ? result.stdout : "";
	});

export const runCreateHooks = (
	task: Task,
	options: HookRuntimeOptions,
): Effect.Effect<Task, string> =>
	Effect.gen(function* () {
		const hooks = yield* discoverHooksForEvent("create", options);
		let currentTask = task;

		for (const hookPath of hooks) {
			const stdout = yield* runHookExecutable(
				hookPath,
				JSON.stringify(currentTask),
				buildHookEnv("create", currentTask.id, options),
			);

			if (stdout.trim().length === 0) {
				continue;
			}

			currentTask = yield* parseTaskFromHookStdout("create", hookPath, stdout);
		}

		return currentTask;
	});

export const runModifyHooks = (
	oldTask: Task,
	newTask: Task,
	options: HookRuntimeOptions,
): Effect.Effect<Task, string> =>
	Effect.gen(function* () {
		const hooks = yield* discoverHooksForEvent("modify", options);
		let currentTask = newTask;

		for (const hookPath of hooks) {
			const stdout = yield* runHookExecutable(
				hookPath,
				JSON.stringify({ old: oldTask, new: currentTask }),
				buildHookEnv("modify", currentTask.id, options),
			);

			if (stdout.trim().length === 0) {
				continue;
			}

			const hookedTask = yield* parseTaskFromHookStdout(
				"modify",
				hookPath,
				stdout,
			);
			if (hookedTask.id !== oldTask.id) {
				return yield* Effect.fail(
					`TaskRepository hook ${hookPath} failed: on-modify hooks cannot change task id`,
				);
			}
			currentTask = hookedTask;
		}

		return currentTask;
	});

export const runNonMutatingHooks = (
	event: "complete" | "delete",
	task: Task,
	options: HookRuntimeOptions,
): Effect.Effect<void, never> =>
	Effect.gen(function* () {
		const hooks = yield* discoverHooksForEvent(event, options).pipe(
			Effect.catchAll(() => Effect.succeed([])),
		);

		for (const hookPath of hooks) {
			yield* runHookExecutable(
				hookPath,
				JSON.stringify(task),
				buildHookEnv(event, task.id, options),
			).pipe(Effect.ignore);
		}
	});
