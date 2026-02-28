import {
	mkdir,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
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
	WorkLogCreateInput as WorkLogCreateInputSchema,
	WorkLogEntry as WorkLogEntrySchema,
	WorkLogPatch as WorkLogPatchSchema,
	Project as ProjectSchema,
	ProjectCreateInput as ProjectCreateInputSchema,
	ProjectPatch as ProjectPatchSchema,
	type Task,
	type TaskCreateInput,
	type TaskPatch,
	type WorkLogCreateInput,
	type WorkLogEntry,
	type WorkLogPatch,
	type Project,
	type ProjectCreateInput,
	type ProjectPatch,
} from "./schema.js";
import {
	byUpdatedDescThenTitle,
	isDueBefore,
	isStalerThan,
	isUnblocked,
	listContexts as listContextsFromTasks,
} from "./query.js";
import { generateTaskId } from "./id.js";
import {
	type HookRuntimeOptions,
	runCreateHooks,
	runModifyHooks,
	runNonMutatingHooks,
} from "./hooks.js";
import {
	buildCompletionRecurrenceTask,
	buildNextClockRecurrenceTask,
	isClockRecurrenceDue,
} from "./recurrence.js";

// Re-export for backwards compatibility
export { discoverHooksForEvent } from "./hooks.js";
export type { HookEvent, HookDiscoveryOptions } from "./hooks.js";
export { generateTaskId } from "./id.js";

const decodeTask = Schema.decodeUnknownSync(TaskSchema);
const decodeTaskEither = Schema.decodeUnknownEither(TaskSchema);
const decodeTaskCreateInput = Schema.decodeUnknownSync(TaskCreateInputSchema);
const decodeTaskPatch = Schema.decodeUnknownSync(TaskPatchSchema);
const decodeWorkLogCreateInput = Schema.decodeUnknownSync(
	WorkLogCreateInputSchema,
);
const decodeWorkLogEntry = Schema.decodeUnknownSync(WorkLogEntrySchema);
const decodeWorkLogEntryEither = Schema.decodeUnknownEither(WorkLogEntrySchema);
const decodeWorkLogPatch = Schema.decodeUnknownSync(WorkLogPatchSchema);

const decodeProject = Schema.decodeUnknownSync(ProjectSchema);
const decodeProjectEither = Schema.decodeUnknownEither(ProjectSchema);
const decodeProjectCreateInput = Schema.decodeUnknownSync(ProjectCreateInputSchema);
const decodeProjectPatch = Schema.decodeUnknownSync(ProjectPatchSchema);

const toErrorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const taskFilePath = (dataDir: string, id: string): string =>
	join(dataDir, "tasks", `${id}.yaml`);

const legacyTaskFilePath = (dataDir: string, id: string): string =>
	join(dataDir, "tasks", `${id}.yml`);

const workLogFilePath = (dataDir: string, id: string): string =>
	join(dataDir, "work-log", `${id}.yaml`);

const legacyWorkLogFilePath = (dataDir: string, id: string): string =>
	join(dataDir, "work-log", `${id}.yml`);

const projectFilePath = (dataDir: string, id: string): string =>
	join(dataDir, "projects", `${id}.yaml`);

const legacyProjectFilePath = (dataDir: string, id: string): string =>
	join(dataDir, "projects", `${id}.yml`);

const dailyHighlightFilePath = (dataDir: string): string =>
	join(dataDir, "daily-highlight.yaml");

const ensureTasksDir = (dataDir: string): Effect.Effect<void, string> =>
	Effect.tryPromise({
		try: () => mkdir(join(dataDir, "tasks"), { recursive: true }),
		catch: (error) =>
			`TaskRepository failed to create tasks directory: ${toErrorMessage(error)}`,
	});

const ensureWorkLogDir = (dataDir: string): Effect.Effect<void, string> =>
	Effect.tryPromise({
		try: () => mkdir(join(dataDir, "work-log"), { recursive: true }),
		catch: (error) =>
			`TaskRepository failed to create work-log directory: ${toErrorMessage(error)}`,
	});

const ensureProjectsDir = (dataDir: string): Effect.Effect<void, string> =>
	Effect.tryPromise({
		try: () => mkdir(join(dataDir, "projects"), { recursive: true }),
		catch: (error) =>
			`TaskRepository failed to create projects directory: ${toErrorMessage(error)}`,
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

const readWorkLogEntryByIdFromDisk = (
	dataDir: string,
	id: string,
): Effect.Effect<
	{ readonly path: string; readonly entry: WorkLogEntry },
	string
> =>
	Effect.tryPromise({
		try: async () => {
			const candidatePaths = [
				workLogFilePath(dataDir, id),
				legacyWorkLogFilePath(dataDir, id),
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
				const entry = parseWorkLogRecord(parsed);
				if (entry === null) {
					throw new Error(`Invalid work log record in ${path}`);
				}

				return { path, entry };
			}

			throw new Error(`Work log entry not found: ${id}`);
		},
		catch: (error) =>
			`TaskRepository failed to read work log entry ${id}: ${toErrorMessage(error)}`,
	});

const readWorkLogEntriesFromDisk = (
	dataDir: string,
): Effect.Effect<Array<WorkLogEntry>, string> =>
	Effect.tryPromise({
		try: async () => {
			const workLogDir = join(dataDir, "work-log");
			const entries = await readdir(workLogDir, { withFileTypes: true }).catch(
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

			const workLogFiles = entries
				.filter(
					(entry) =>
						entry.isFile() &&
						(entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")),
				)
				.map((entry) => entry.name);

			const workLogEntries: Array<WorkLogEntry> = [];

			for (const fileName of workLogFiles) {
				const filePath = join(workLogDir, fileName);
				const source = await readFile(filePath, "utf8");
				const parsed = YAML.parse(source);
				const workLogEntry = parseWorkLogRecord(parsed);

				if (workLogEntry === null) {
					throw new Error(`Invalid work log record in ${filePath}`);
				}

				workLogEntries.push(workLogEntry);
			}

			return workLogEntries;
		},
		catch: (error) =>
			`TaskRepository.listWorkLog failed to read work log files: ${toErrorMessage(error)}`,
	});

const writeWorkLogEntryToDisk = (
	path: string,
	entry: WorkLogEntry,
): Effect.Effect<void, string> =>
	Effect.tryPromise({
		try: () => writeFile(path, YAML.stringify(entry), "utf8"),
		catch: (error) =>
			`TaskRepository failed to write work log entry ${entry.id}: ${toErrorMessage(error)}`,
	});

const deleteWorkLogEntryFromDisk = (
	path: string,
	id: string,
): Effect.Effect<void, string> =>
	Effect.tryPromise({
		try: () => rm(path),
		catch: (error) =>
			`TaskRepository failed to delete work log entry ${id}: ${toErrorMessage(error)}`,
	});

const toWorkLogTimestamp = (startedAt: string): Effect.Effect<string, string> =>
	Effect.try({
		try: () => {
			const parsed = new Date(startedAt);
			if (Number.isNaN(parsed.getTime())) {
				throw new Error(`Invalid started_at: ${startedAt}`);
			}

			const iso = parsed.toISOString();
			return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}`;
		},
		catch: (error) =>
			`TaskRepository failed to derive work log timestamp: ${toErrorMessage(error)}`,
	});

const toWorkLogDate = (startedAt: string): Effect.Effect<string, string> =>
	Effect.try({
		try: () => {
			const parsed = new Date(startedAt);
			if (Number.isNaN(parsed.getTime())) {
				throw new Error(`Invalid started_at: ${startedAt}`);
			}
			return parsed.toISOString().slice(0, 10);
		},
		catch: (error) =>
			`TaskRepository failed to derive work log date: ${toErrorMessage(error)}`,
	});

const generateNextClockRecurrence = (
	dataDir: string,
	existing: { readonly path: string; readonly task: Task },
	generatedAt: Date,
): Effect.Effect<
	{ readonly nextTask: Task; readonly replacedId: string | null },
	string
> =>
	Effect.gen(function* () {
		const result = yield* buildNextClockRecurrenceTask(
			existing.task,
			generatedAt,
		);

		if (result.updatedCurrent !== null) {
			yield* writeTaskToDisk(existing.path, result.updatedCurrent);
		}

		yield* ensureTasksDir(dataDir);
		yield* writeTaskToDisk(
			taskFilePath(dataDir, result.nextTask.id),
			result.nextTask,
		);

		const replacedId = result.shouldReplaceCurrent
			? existing.task.id
			: null;

		return { nextTask: result.nextTask, replacedId } as const;
	});

const readProjectByIdFromDisk = (
	dataDir: string,
	id: string,
): Effect.Effect<{ readonly path: string; readonly project: Project }, string> =>
	Effect.tryPromise({
		try: async () => {
			const candidatePaths = [
				projectFilePath(dataDir, id),
				legacyProjectFilePath(dataDir, id),
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
				const project = parseProjectRecord(parsed);
				if (project === null) {
					throw new Error(`Invalid project record in ${path}`);
				}

				return { path, project };
			}

			throw new Error(`Project not found: ${id}`);
		},
		catch: (error) =>
			`TaskRepository failed to read project ${id}: ${toErrorMessage(error)}`,
	});

const readProjectsFromDisk = (
	dataDir: string,
): Effect.Effect<Array<Project>, string> =>
	Effect.tryPromise({
		try: async () => {
			const projectsDir = join(dataDir, "projects");
			const entries = await readdir(projectsDir, { withFileTypes: true }).catch(
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

			const projectFiles = entries
				.filter(
					(entry) =>
						entry.isFile() &&
						(entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")),
				)
				.map((entry) => entry.name);

			const projects: Array<Project> = [];

			for (const fileName of projectFiles) {
				const filePath = join(projectsDir, fileName);
				const source = await readFile(filePath, "utf8");
				const parsed = YAML.parse(source);
				const project = parseProjectRecord(parsed);

				if (project === null) {
					throw new Error(`Invalid project record in ${filePath}`);
				}

				projects.push(project);
			}

			return projects;
		},
		catch: (error) =>
			`TaskRepository.listProjects failed to read project files: ${toErrorMessage(error)}`,
	});

const writeProjectToDisk = (
	path: string,
	project: Project,
): Effect.Effect<void, string> =>
	Effect.tryPromise({
		try: () => writeFile(path, YAML.stringify(project), "utf8"),
		catch: (error) =>
			`TaskRepository failed to write project ${project.id}: ${toErrorMessage(error)}`,
	});

const deleteProjectFromDisk = (
	path: string,
	id: string,
): Effect.Effect<void, string> =>
	Effect.tryPromise({
		try: () => rm(path),
		catch: (error) =>
			`TaskRepository failed to delete project ${id}: ${toErrorMessage(error)}`,
	});

const byStartedAtDescThenId = (a: WorkLogEntry, b: WorkLogEntry): number => {
	const byStartedAtDesc = b.started_at.localeCompare(a.started_at);
	if (byStartedAtDesc !== 0) {
		return byStartedAtDesc;
	}

	return a.id.localeCompare(b.id);
};

export const applyListTaskFilters = (
	tasks: Array<Task>,
	filters: ListTasksFilters = {},
): Array<Task> => {
	const dueBeforePredicate =
		filters.due_before !== undefined ? isDueBefore(filters.due_before) : null;
	const stalePredicate =
		filters.stale_days !== undefined
			? isStalerThan(filters.stale_days, todayIso())
			: null;

	return tasks
		.filter((task) => {
			if (filters.status !== undefined && task.status !== filters.status) {
				return false;
			}

			if (filters.area !== undefined && task.area !== filters.area) {
				return false;
			}

			if (filters.project !== undefined && !task.projects.includes(filters.project)) {
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

			if (
				filters.duration_min !== undefined &&
				(task.estimated_minutes === null || task.estimated_minutes < filters.duration_min)
			) {
				return false;
			}

			if (
				filters.duration_max !== undefined &&
				(task.estimated_minutes === null || task.estimated_minutes > filters.duration_max)
			) {
				return false;
			}

			if (
				filters.context !== undefined &&
				task.context !== filters.context
			) {
				return false;
			}

			if (
				filters.include_templates !== true &&
				task.is_template === true
			) {
				return false;
			}

			if (stalePredicate !== null && !stalePredicate(task)) {
				return false;
			}

			if (
				filters.priority !== undefined &&
				task.priority !== filters.priority
			) {
				return false;
			}

			if (
				filters.type !== undefined &&
				task.type !== filters.type
			) {
				return false;
			}

			if (
				filters.assignee !== undefined &&
				task.assignee !== filters.assignee
			) {
				return false;
			}

			if (
				filters.unassigned === true &&
				task.assignee !== null
			) {
				return false;
			}

			if (
				filters.parent !== undefined &&
				task.parent !== filters.parent
			) {
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
	readonly duration_min?: number;
	readonly duration_max?: number;
	readonly context?: string;
	readonly include_templates?: boolean;
	readonly stale_days?: number;
	readonly priority?: number;
	readonly type?: string;
	readonly assignee?: string;
	readonly unassigned?: boolean;
	readonly parent?: string;
}

export interface ListProjectsFilters {
	readonly status?: string;
	readonly area?: string;
}

export const applyListProjectFilters = (
	projects: Array<Project>,
	filters: ListProjectsFilters = {},
): Array<Project> => {
	return projects
		.filter((project) => {
			if (filters.status !== undefined && project.status !== filters.status) {
				return false;
			}
			if (filters.area !== undefined && project.area !== filters.area) {
				return false;
			}
			return true;
		})
		.sort((a, b) => {
			const byUpdatedDesc = b.updated.localeCompare(a.updated);
			if (byUpdatedDesc !== 0) {
				return byUpdatedDesc;
			}
			return a.title.localeCompare(b.title);
		});
};

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
	readonly completeTask: (id: string) => Effect.Effect<Task, string>;
	readonly generateNextRecurrence: (id: string) => Effect.Effect<Task, string>;
	readonly processDueRecurrences: (
		now: Date,
	) => Effect.Effect<
		{ readonly created: Array<Task>; readonly replaced: Array<string> },
		string
	>;
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
	readonly importTask: (task: Task) => Effect.Effect<Task, string>;
	readonly importWorkLogEntry: (
		entry: WorkLogEntry,
	) => Effect.Effect<WorkLogEntry, string>;
	readonly listProjects: (
		filters?: ListProjectsFilters,
	) => Effect.Effect<Array<Project>, string>;
	readonly getProject: (id: string) => Effect.Effect<Project, string>;
	readonly createProject: (
		input: ProjectCreateInput,
	) => Effect.Effect<Project, string>;
	readonly updateProject: (
		id: string,
		patch: ProjectPatch,
	) => Effect.Effect<Project, string>;
	readonly deleteProject: (id: string) => Effect.Effect<DeleteResult, string>;
	readonly importProject: (project: Project) => Effect.Effect<Project, string>;
	readonly getDailyHighlight: () => Effect.Effect<Task | null, string>;
	readonly listContexts: () => Effect.Effect<Array<string>, string>;
	readonly getRelated: (id: string) => Effect.Effect<Array<Task>, string>;
	readonly instantiateTemplate: (
		templateId: string,
		overrides?: {
			readonly title?: string;
			readonly due?: string;
			readonly defer_until?: string;
			readonly status?: string;
			readonly projects?: ReadonlyArray<string>;
		},
	) => Effect.Effect<Task, string>;
}

export class TaskRepository extends Context.Tag("TaskRepository")<
	TaskRepository,
	TaskRepositoryService
>() {}

export interface TaskRepositoryLiveOptions {
	readonly dataDir?: string;
	readonly hooksDir?: string;
	readonly hookEnv?: NodeJS.ProcessEnv;
}

const defaultDataDir = (): string => {
	const home = process.env.HOME;
	return home !== undefined && home.length > 0
		? `${home}/.local/share/tashks`
		: ".local/share/tashks";
};

export const buildInstanceFromTemplate = (
	template: Task,
	overrides?: {
		readonly title?: string;
		readonly due?: string;
		readonly defer_until?: string;
		readonly status?: string;
		readonly projects?: ReadonlyArray<string>;
	},
): Task => {
	const now = new Date().toISOString().slice(0, 10);
	return decodeTask({
		id: generateTaskId(overrides?.title ?? template.title),
		title: overrides?.title ?? template.title,
		description: template.description,
		status: overrides?.status ?? "backlog",
		area: template.area,
		projects: overrides?.projects
			? [...overrides.projects]
			: [...template.projects],
		tags: [...template.tags],
		created: now,
		updated: now,
		urgency: template.urgency,
		energy: template.energy,
		due: overrides?.due ?? null,
		context: template.context,
		subtasks: template.subtasks.map((s) => ({ text: s.text, done: false })),
		blocked_by: [],
		estimated_minutes: template.estimated_minutes,
		actual_minutes: null,
		completed_at: null,
		last_surfaced: null,
		defer_until: overrides?.defer_until ?? null,
		nudge_count: 0,
		recurrence: null,
		recurrence_trigger: "clock",
		recurrence_strategy: "replace",
		recurrence_last_generated: null,
		related: [...template.related],
		is_template: false,
		from_template: template.id,
		priority: template.priority,
		type: template.type,
		assignee: null,
		parent: null,
		close_reason: null,
		comments: [],
	});
};

const validateNoTemplateRefs = (
	relatedIds: ReadonlyArray<string>,
	allTasks: Array<Task>,
): Effect.Effect<void, string> => {
	const templateIds = allTasks
		.filter((t) => t.is_template)
		.map((t) => t.id);
	const badRefs = relatedIds.filter((id) => templateIds.includes(id));
	if (badRefs.length > 0) {
		return Effect.fail(
			`Cannot reference template(s) in related: ${badRefs.join(", ")}`,
		);
	}
	return Effect.void;
};

const makeTaskRepositoryLive = (
	options: TaskRepositoryLiveOptions = {},
): TaskRepositoryService => {
	const dataDir = options.dataDir ?? defaultDataDir();
	const hookRuntimeOptions: HookRuntimeOptions = {
		hooksDir: options.hooksDir,
		env: options.hookEnv,
		dataDir,
	};

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
				if (created.related.length > 0) {
					const allTasks = yield* readTasksFromDisk(dataDir);
					yield* validateNoTemplateRefs(created.related, allTasks);
				}
				const taskFromHooks = yield* runCreateHooks(
					created,
					hookRuntimeOptions,
				);
				yield* writeTaskToDisk(
					taskFilePath(dataDir, taskFromHooks.id),
					taskFromHooks,
				);
				return taskFromHooks;
			}),
		updateTask: (id, patch) =>
			Effect.gen(function* () {
				const existing = yield* readTaskByIdFromDisk(dataDir, id);
				const updated = applyTaskPatch(existing.task, patch);
				if (
					patch.related !== undefined &&
					updated.related.length > 0
				) {
					const allTasks = yield* readTasksFromDisk(dataDir);
					yield* validateNoTemplateRefs(updated.related, allTasks);
				}
				const taskFromHooks = yield* runModifyHooks(
					existing.task,
					updated,
					hookRuntimeOptions,
				);
				yield* writeTaskToDisk(existing.path, taskFromHooks);
				return taskFromHooks;
			}),
		completeTask: (id) =>
			Effect.gen(function* () {
				const existing = yield* readTaskByIdFromDisk(dataDir, id);
				const completedAt = new Date().toISOString();
				const completedDate = completedAt.slice(0, 10);

				const completedTask = decodeTask({
					...existing.task,
					status: "done",
					updated: completedDate,
					completed_at: completedAt,
				});

				const nextRecurringTask = yield* buildCompletionRecurrenceTask(
					completedTask,
					completedAt,
				);

				yield* writeTaskToDisk(existing.path, completedTask);
				yield* runNonMutatingHooks(
					"complete",
					completedTask,
					hookRuntimeOptions,
				);

				if (nextRecurringTask !== null) {
					yield* ensureTasksDir(dataDir);
					yield* writeTaskToDisk(
						taskFilePath(dataDir, nextRecurringTask.id),
						nextRecurringTask,
					);
				}

				return completedTask;
			}),
		generateNextRecurrence: (id) =>
			Effect.gen(function* () {
				const existing = yield* readTaskByIdFromDisk(dataDir, id);
				const generated = yield* generateNextClockRecurrence(
					dataDir,
					existing,
					new Date(),
				);
				return generated.nextTask;
			}),
		processDueRecurrences: (now) =>
			Effect.gen(function* () {
				const tasks = yield* readTasksFromDisk(dataDir);
				const recurringTasks = tasks.filter(
					(task) =>
						task.recurrence !== null &&
						task.recurrence_trigger === "clock" &&
						task.status !== "done" &&
						task.status !== "dropped" &&
						!task.is_template,
				);

				const created: Array<Task> = [];
				const replaced: Array<string> = [];

				for (const task of recurringTasks) {
					const due = yield* isClockRecurrenceDue(task, now);
					if (!due) {
						continue;
					}

					const existing = yield* readTaskByIdFromDisk(dataDir, task.id);
					const generated = yield* generateNextClockRecurrence(
						dataDir,
						existing,
						now,
					);
					created.push(generated.nextTask);
					if (generated.replacedId !== null) {
						replaced.push(generated.replacedId);
					}
				}

				return { created, replaced } as const;
			}),
		deleteTask: (id) =>
			Effect.gen(function* () {
				const existing = yield* readTaskByIdFromDisk(dataDir, id);
				yield* deleteTaskFromDisk(existing.path, id);
				yield* runNonMutatingHooks("delete", existing.task, hookRuntimeOptions);
				return { deleted: true } as const;
			}),
		setDailyHighlight: (id) =>
			Effect.gen(function* () {
				const existing = yield* readTaskByIdFromDisk(dataDir, id);
				yield* writeDailyHighlightToDisk(dataDir, id);
				return existing.task;
			}),
		getDailyHighlight: () =>
			Effect.gen(function* () {
				const source = yield* Effect.tryPromise({
					try: () =>
						readFile(dailyHighlightFilePath(dataDir), "utf8").catch(
							(error: unknown) => {
								if (
									error !== null &&
									typeof error === "object" &&
									"code" in error &&
									error.code === "ENOENT"
								) {
									return null;
								}
								throw error;
							},
						),
					catch: (error) =>
						`TaskRepository failed to read daily highlight: ${toErrorMessage(error)}`,
				});

				if (source === null || source.trim().length === 0) {
					return null;
				}

				const parsed = YAML.parse(source);
				if (
					parsed === null ||
					typeof parsed !== "object" ||
					typeof parsed.id !== "string"
				) {
					return null;
				}

				const result = yield* Effect.catchAll(
					Effect.map(
						readTaskByIdFromDisk(dataDir, parsed.id),
						(r) => r.task as Task | null,
					),
					() => Effect.succeed(null as Task | null),
				);
				return result;
			}),
		listStale: (days) =>
			Effect.map(readTasksFromDisk(dataDir), (tasks) => {
				const stalePredicate = isStalerThan(days, todayIso());
				return tasks
					.filter((task) => task.status === "active" && stalePredicate(task))
					.sort(byUpdatedDescThenTitle);
			}),
		listWorkLog: (filters) =>
			Effect.map(readWorkLogEntriesFromDisk(dataDir), (entries) =>
				entries
					.filter((entry) =>
						filters?.date !== undefined ? entry.date === filters.date : true,
					)
					.sort(byStartedAtDescThenId),
			),
		createWorkLogEntry: (input) =>
			Effect.gen(function* () {
				yield* ensureWorkLogDir(dataDir);
				const normalizedInput = decodeWorkLogCreateInput(input);
				const timestamp = yield* toWorkLogTimestamp(normalizedInput.started_at);
				const date = yield* toWorkLogDate(normalizedInput.started_at);

				const created = decodeWorkLogEntry({
					id: `${normalizedInput.task_id}-${timestamp}`,
					task_id: normalizedInput.task_id,
					started_at: normalizedInput.started_at,
					ended_at: normalizedInput.ended_at,
					date,
				});

				yield* writeWorkLogEntryToDisk(
					workLogFilePath(dataDir, created.id),
					created,
				);
				return created;
			}),
		updateWorkLogEntry: (id, patch) =>
			Effect.gen(function* () {
				const existing = yield* readWorkLogEntryByIdFromDisk(dataDir, id);
				const updated = applyWorkLogPatch(existing.entry, patch);
				yield* writeWorkLogEntryToDisk(existing.path, updated);
				return updated;
			}),
		deleteWorkLogEntry: (id) =>
			Effect.gen(function* () {
				const existing = yield* readWorkLogEntryByIdFromDisk(dataDir, id);
				yield* deleteWorkLogEntryFromDisk(existing.path, id);
				return { deleted: true } as const;
			}),
		importTask: (task) =>
			Effect.gen(function* () {
				yield* ensureTasksDir(dataDir);
				yield* writeTaskToDisk(taskFilePath(dataDir, task.id), task);
				return task;
			}),
		importWorkLogEntry: (entry) =>
			Effect.gen(function* () {
				yield* ensureWorkLogDir(dataDir);
				yield* writeWorkLogEntryToDisk(
					workLogFilePath(dataDir, entry.id),
					entry,
				);
				return entry;
			}),
		listProjects: (filters) =>
			Effect.map(readProjectsFromDisk(dataDir), (projects) =>
				applyListProjectFilters(projects, filters),
			),
		getProject: (id) =>
			Effect.map(readProjectByIdFromDisk(dataDir, id), (result) => result.project),
		createProject: (input) =>
			Effect.gen(function* () {
				yield* ensureProjectsDir(dataDir);
				const created = createProjectFromInput(input);
				yield* writeProjectToDisk(
					projectFilePath(dataDir, created.id),
					created,
				);
				return created;
			}),
		updateProject: (id, patch) =>
			Effect.gen(function* () {
				const existing = yield* readProjectByIdFromDisk(dataDir, id);
				const updated = applyProjectPatch(existing.project, patch);
				yield* writeProjectToDisk(existing.path, updated);
				return updated;
			}),
		deleteProject: (id) =>
			Effect.gen(function* () {
				const existing = yield* readProjectByIdFromDisk(dataDir, id);
				yield* deleteProjectFromDisk(existing.path, id);
				return { deleted: true } as const;
			}),
		importProject: (project) =>
			Effect.gen(function* () {
				yield* ensureProjectsDir(dataDir);
				yield* writeProjectToDisk(projectFilePath(dataDir, project.id), project);
				return project;
			}),
		listContexts: () =>
			Effect.map(readTasksFromDisk(dataDir), (tasks) =>
				listContextsFromTasks(tasks),
			),
		getRelated: (id) =>
			Effect.gen(function* () {
				const existing = yield* readTaskByIdFromDisk(dataDir, id);
				const allTasks = yield* readTasksFromDisk(dataDir);
				const targetRelated = new Set(existing.task.related);
				return allTasks.filter(
					(t) =>
						t.id !== id &&
						(targetRelated.has(t.id) || t.related.includes(id)),
				);
			}),
		instantiateTemplate: (templateId, overrides) =>
			Effect.gen(function* () {
				const existing = yield* readTaskByIdFromDisk(dataDir, templateId);
				const template = existing.task;

				if (!template.is_template) {
					return yield* Effect.fail(
						`Task ${templateId} is not a template`,
					);
				}

				const instance = buildInstanceFromTemplate(template, overrides);
				const taskFromHooks = yield* runCreateHooks(
					instance,
					hookRuntimeOptions,
				);

				yield* ensureTasksDir(dataDir);
				yield* writeTaskToDisk(
					taskFilePath(dataDir, taskFromHooks.id),
					taskFromHooks,
				);
				return taskFromHooks;
			}),
	};
};

export const TaskRepositoryLive = (
	options: TaskRepositoryLiveOptions = {},
): Layer.Layer<TaskRepository> =>
	Layer.succeed(TaskRepository, makeTaskRepositoryLive(options));

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

const migrateTaskRecord = (record: unknown): unknown => {
	if (record === null || typeof record !== "object") {
		return record;
	}
	let rec = record as Record<string, unknown>;
	if ("project" in rec && !("projects" in rec)) {
		const { project, ...rest } = rec;
		rec = {
			...rest,
			projects:
				typeof project === "string" ? [project] : [],
		} as Record<string, unknown>;
	}
	if (!("related" in rec)) rec.related = [];
	if (!("is_template" in rec)) rec.is_template = false;
	if (!("from_template" in rec)) rec.from_template = null;
	if (!("priority" in rec)) rec.priority = null;
	if (!("type" in rec)) rec.type = "task";
	if (!("assignee" in rec)) rec.assignee = null;
	if (!("parent" in rec)) rec.parent = null;
	if (!("close_reason" in rec)) rec.close_reason = null;
	if (!("description" in rec)) rec.description = "";
	if (!("comments" in rec)) rec.comments = [];
	return rec;
};

export const parseTaskRecord = (record: unknown): Task | null => {
	const migrated = migrateTaskRecord(record);
	const result = decodeTaskEither(migrated);
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
	const { from_template: _stripped, ...safePatch } = normalizedPatch;

	return decodeTask({
		...normalizedTask,
		...safePatch,
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

export const parseProjectRecord = (record: unknown): Project | null => {
	const result = decodeProjectEither(record);
	return Either.isRight(result) ? result.right : null;
};

export const createProjectFromInput = (input: ProjectCreateInput): Project => {
	const normalizedInput = decodeProjectCreateInput(input);

	return decodeProject({
		...normalizedInput,
		id: generateTaskId(normalizedInput.title),
	});
};

export const promoteSubtask = (
	repository: TaskRepositoryService,
	taskId: string,
	subtaskIndex: number,
): Effect.Effect<Task, string> =>
	Effect.gen(function* () {
		const parent = yield* repository.getTask(taskId);

		if (parent.is_template) {
			return yield* Effect.fail(
				"Cannot promote subtasks on a template. Instantiate the template first.",
			);
		}

		if (subtaskIndex < 0 || subtaskIndex >= parent.subtasks.length) {
			return yield* Effect.fail(
				`Subtask index ${subtaskIndex} is out of range (0..${parent.subtasks.length - 1})`,
			);
		}

		const subtask = parent.subtasks[subtaskIndex];

		const newTask = yield* repository.createTask({
			title: subtask.text,
			projects: [...parent.projects],
			area: parent.area,
			tags: [...parent.tags],
			status: subtask.done ? "done" : "backlog",
			blocked_by: [parent.id],
		});

		const updatedSubtasks = parent.subtasks.filter(
			(_, i) => i !== subtaskIndex,
		);
		yield* repository.updateTask(taskId, { subtasks: updatedSubtasks });

		return newTask;
	});

export const applyProjectPatch = (project: Project, patch: ProjectPatch): Project => {
	const normalizedProject = decodeProject(project);
	const normalizedPatch = decodeProjectPatch(patch);

	return decodeProject({
		...normalizedProject,
		...normalizedPatch,
		updated: todayIso(),
	});
};
