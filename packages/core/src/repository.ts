import { randomBytes } from "node:crypto";
import * as Context from "effect/Context";
import * as Either from "effect/Either";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
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
		listTasks: () => notImplemented("listTasks", dataDir),
		getTask: () => notImplemented("getTask", dataDir),
		createTask: () => notImplemented("createTask", dataDir),
		updateTask: () => notImplemented("updateTask", dataDir),
		deleteTask: () => notImplemented("deleteTask", dataDir),
		setDailyHighlight: () => notImplemented("setDailyHighlight", dataDir),
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
