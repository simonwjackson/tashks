import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as Context from "effect/Context";
import * as Either from "effect/Either";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import {
	Task as TaskSchema,
	TaskCreateInput as TaskCreateInputSchema,
	TaskPatch as TaskPatchSchema,
	WorkLogEntry as WorkLogEntrySchema,
	WorkLogPatch as WorkLogPatchSchema,
	type Task,
	type TaskCreateInput,
	type TaskPatch,
	type WorkLogCreateInput,
	type WorkLogEntry,
	type WorkLogPatch,
} from "./schema.js";
import { byUpdatedDescThenTitle, isDueBefore, isUnblocked } from "./query.js";

const idSuffixAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
const idSuffixLength = 6;

const slugifyTitle = (title: string): string => {
	const slug = title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return slug.length > 0 ? slug : "task";
};

const randomIdSuffix = (): string => {
	const random = randomBytes(idSuffixLength);
	return Array.from(
		random,
		(value) => idSuffixAlphabet[value % idSuffixAlphabet.length],
	).join("");
};

const decodeTask = Schema.decodeUnknownSync(TaskSchema);
const decodeTaskEither = Schema.decodeUnknownEither(TaskSchema);
const decodeTaskCreateInput = Schema.decodeUnknownSync(TaskCreateInputSchema);
const decodeTaskPatch = Schema.decodeUnknownSync(TaskPatchSchema);
const decodeWorkLogEntry = Schema.decodeUnknownSync(WorkLogEntrySchema);
const decodeWorkLogEntryEither = Schema.decodeUnknownEither(WorkLogEntrySchema);
const decodeWorkLogPatch = Schema.decodeUnknownSync(WorkLogPatchSchema);

const toErrorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const taskFilePath = (dataDir: string, id: string): string =>
	join(dataDir, "tasks", `${id}.yaml`);

const legacyTaskFilePath = (dataDir: string, id: string): string =>
	join(dataDir, "tasks", `${id}.yml`);

const dailyHighlightFilePath = (dataDir: string): string =>
	join(dataDir, "daily-highlight.yaml");

const ensureTasksDir = (dataDir: string): Effect.Effect<void, string> =>
	Effect.tryPromise({
		try: () => mkdir(join(dataDir, "tasks"), { recursive: true }),
		catch: (error) =>
			`TaskRepository failed to create tasks directory: ${toErrorMessage(error)}`,
	});

const writeDailyHighlightToDisk = (
	dataDir: string,
	id: string,
): Effect.Effect<void, string> =>
	Effect.tryPromise({
		try: async () => {
			await mkdir(dataDir, { recursive: true });
			await writeFile(
				dailyHighlightFilePath(dataDir),
				YAML.stringify({ id }),
				"utf8",
			);
		},
		catch: (error) =>
			`TaskRepository failed to write daily highlight ${id}: ${toErrorMessage(error)}`,
	});

const readTaskByIdFromDisk = (
	dataDir: string,
	id: string,
): Effect.Effect<{ readonly path: string; readonly task: Task }, string> =>
	Effect.tryPromise({
		try: async () => {
			const candidatePaths = [
				taskFilePath(dataDir, id),
				legacyTaskFilePath(dataDir, id),
			];

			for (const path of candidatePaths) {
				const source = await readFile(path, "utf8").catch((error: unknown) => {
					if (
						error !== null &&
						typeof error === "object" &&
						"code" in error &&
						error.code === "ENOENT"
					) {
						return null;
					}
					throw error;
				});

				if (source === null) {
					continue;
				}

				const parsed = YAML.parse(source);
				const task = parseTaskRecord(parsed);
				if (task === null) {
					throw new Error(`Invalid task record in ${path}`);
				}

				return { path, task };
			}

			throw new Error(`Task not found: ${id}`);
		},
		catch: (error) =>
			`TaskRepository failed to read task ${id}: ${toErrorMessage(error)}`,
	});

const writeTaskToDisk = (
	path: string,
	task: Task,
): Effect.Effect<void, string> =>
	Effect.tryPromise({
		try: () => writeFile(path, YAML.stringify(task), "utf8"),
		catch: (error) =>
			`TaskRepository failed to write task ${task.id}: ${toErrorMessage(error)}`,
	});

const deleteTaskFromDisk = (
	path: string,
	id: string,
): Effect.Effect<void, string> =>
	Effect.tryPromise({
		try: () => rm(path),
		catch: (error) =>
			`TaskRepository failed to delete task ${id}: ${toErrorMessage(error)}`,
	});

const readTasksFromDisk = (
	dataDir: string,
): Effect.Effect<Array<Task>, string> =>
	Effect.tryPromise({
		try: async () => {
			const tasksDir = join(dataDir, "tasks");
			const entries = await readdir(tasksDir, { withFileTypes: true }).catch(
				(error: unknown) => {
					if (
						error !== null &&
						typeof error === "object" &&
						"code" in error &&
						error.code === "ENOENT"
					) {
						return [];
					}
					throw error;
				},
			);

			const taskFiles = entries
				.filter(
					(entry) =>
						entry.isFile() &&
						(entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")),
				)
				.map((entry) => entry.name);

			const tasks: Array<Task> = [];

			for (const fileName of taskFiles) {
				const filePath = join(tasksDir, fileName);
				const source = await readFile(filePath, "utf8");
				const parsed = YAML.parse(source);
				const task = parseTaskRecord(parsed);

				if (task === null) {
					throw new Error(`Invalid task record in ${filePath}`);
				}

				tasks.push(task);
			}

			return tasks;
		},
		catch: (error) =>
			`TaskRepository.listTasks failed to read task files: ${toErrorMessage(error)}`,
	});

const applyListTaskFilters = (
	tasks: Array<Task>,
	filters: ListTasksFilters = {},
): Array<Task> => {
	const dueBeforePredicate =
		filters.due_before !== undefined ? isDueBefore(filters.due_before) : null;

	return tasks
		.filter((task) => {
			if (filters.status !== undefined && task.status !== filters.status) {
				return false;
			}

			if (filters.area !== undefined && task.area !== filters.area) {
				return false;
			}

			if (filters.project !== undefined && task.project !== filters.project) {
				return false;
			}

			if (
				filters.tags !== undefined &&
				filters.tags.length > 0 &&
				!filters.tags.some((tag) => task.tags.includes(tag))
			) {
				return false;
			}

			if (dueBeforePredicate !== null && !dueBeforePredicate(task)) {
				return false;
			}

			if (
				filters.due_after !== undefined &&
				(task.due === null || task.due < filters.due_after)
			) {
				return false;
			}

			if (
				filters.date !== undefined &&
				task.defer_until !== null &&
				task.defer_until > filters.date
			) {
				return false;
			}

			if (filters.unblocked_only === true && !isUnblocked(task, tasks)) {
				return false;
			}

			return true;
		})
		.sort(byUpdatedDescThenTitle);
};

export interface ListTasksFilters {
	readonly status?: Task["status"];
	readonly area?: Task["area"];
	readonly project?: string;
	readonly tags?: ReadonlyArray<string>;
	readonly due_before?: string;
	readonly due_after?: string;
	readonly unblocked_only?: boolean;
	readonly date?: string;
}

export interface ListWorkLogFilters {
	readonly date?: string;
}

export interface DeleteResult {
	readonly deleted: true;
}

export interface TaskRepositoryService {
	readonly listTasks: (
		filters?: ListTasksFilters,
	) => Effect.Effect<Array<Task>, string>;
	readonly getTask: (id: string) => Effect.Effect<Task, string>;
	readonly createTask: (input: TaskCreateInput) => Effect.Effect<Task, string>;
	readonly updateTask: (
		id: string,
		patch: TaskPatch,
	) => Effect.Effect<Task, string>;
	readonly deleteTask: (id: string) => Effect.Effect<DeleteResult, string>;
	readonly setDailyHighlight: (id: string) => Effect.Effect<Task, string>;
	readonly listStale: (days: number) => Effect.Effect<Array<Task>, string>;
	readonly listWorkLog: (
		filters?: ListWorkLogFilters,
	) => Effect.Effect<Array<WorkLogEntry>, string>;
	readonly createWorkLogEntry: (
		input: WorkLogCreateInput,
	) => Effect.Effect<WorkLogEntry, string>;
	readonly updateWorkLogEntry: (
		id: string,
		patch: WorkLogPatch,
	) => Effect.Effect<WorkLogEntry, string>;
	readonly deleteWorkLogEntry: (
		id: string,
	) => Effect.Effect<DeleteResult, string>;
}

export class TaskRepository extends Context.Tag("TaskRepository")<
	TaskRepository,
	TaskRepositoryService
>() {}

export interface TaskRepositoryLiveOptions {
	readonly dataDir?: string;
}

const defaultDataDir = (): string => {
	const home = process.env.HOME;
	return home !== undefined && home.length > 0
		? `${home}/.local/share/tasks`
		: ".local/share/tasks";
};

const notImplemented = <A>(
	operation: string,
	dataDir: string,
): Effect.Effect<A, string> =>
	Effect.fail(
		`TaskRepository.${operation} is not implemented yet (data dir: ${dataDir})`,
	);

const makeTaskRepositoryLive = (
	options: TaskRepositoryLiveOptions = {},
): TaskRepositoryService => {
	const dataDir = options.dataDir ?? defaultDataDir();

	return {
		listTasks: (filters) =>
			Effect.map(readTasksFromDisk(dataDir), (tasks) =>
				applyListTaskFilters(tasks, filters),
			),
		getTask: (id) =>
			Effect.map(readTaskByIdFromDisk(dataDir, id), (result) => result.task),
		createTask: (input) =>
			Effect.gen(function* () {
				yield* ensureTasksDir(dataDir);
				const created = createTaskFromInput(input);
				const path = taskFilePath(dataDir, created.id);
				yield* writeTaskToDisk(path, created);
				return created;
			}),
		updateTask: (id, patch) =>
			Effect.gen(function* () {
				const existing = yield* readTaskByIdFromDisk(dataDir, id);
				const updated = applyTaskPatch(existing.task, patch);
				yield* writeTaskToDisk(existing.path, updated);
				return updated;
			}),
		deleteTask: (id) =>
			Effect.gen(function* () {
				const existing = yield* readTaskByIdFromDisk(dataDir, id);
				yield* deleteTaskFromDisk(existing.path, id);
				return { deleted: true } as const;
			}),
		setDailyHighlight: (id) =>
			Effect.gen(function* () {
				const existing = yield* readTaskByIdFromDisk(dataDir, id);
				yield* writeDailyHighlightToDisk(dataDir, id);
				return existing.task;
			}),
		listStale: () => notImplemented("listStale", dataDir),
		listWorkLog: () => notImplemented("listWorkLog", dataDir),
		createWorkLogEntry: () => notImplemented("createWorkLogEntry", dataDir),
		updateWorkLogEntry: () => notImplemented("updateWorkLogEntry", dataDir),
		deleteWorkLogEntry: () => notImplemented("deleteWorkLogEntry", dataDir),
	};
};

export const TaskRepositoryLive = (
	options: TaskRepositoryLiveOptions = {},
): Layer.Layer<TaskRepository> =>
	Layer.succeed(TaskRepository, makeTaskRepositoryLive(options));

export const generateTaskId = (title: string): string =>
	`${slugifyTitle(title)}-${randomIdSuffix()}`;

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const parseTaskRecord = (record: unknown): Task | null => {
	const result = decodeTaskEither(record);
	return Either.isRight(result) ? result.right : null;
};

export const parseWorkLogRecord = (record: unknown): WorkLogEntry | null => {
	const result = decodeWorkLogEntryEither(record);
	return Either.isRight(result) ? result.right : null;
};

export const createTaskFromInput = (input: TaskCreateInput): Task => {
	const normalizedInput = decodeTaskCreateInput(input);

	return decodeTask({
		...normalizedInput,
		id: generateTaskId(normalizedInput.title),
	});
};

export const applyTaskPatch = (task: Task, patch: TaskPatch): Task => {
	const normalizedTask = decodeTask(task);
	const normalizedPatch = decodeTaskPatch(patch);

	return decodeTask({
		...normalizedTask,
		...normalizedPatch,
		updated: todayIso(),
	});
};

export const applyWorkLogPatch = (
	entry: WorkLogEntry,
	patch: WorkLogPatch,
): WorkLogEntry => {
	const normalizedEntry = decodeWorkLogEntry(entry);
	const normalizedPatch = decodeWorkLogPatch(patch);

	return decodeWorkLogEntry({
		...normalizedEntry,
		...normalizedPatch,
	});
};
