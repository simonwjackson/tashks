import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import { createNodeDatabase } from "@proseql/node";
import YAML from "yaml";
import {
	Task as TaskSchema,
	WorkLogCreateInput as WorkLogCreateInputSchema,
	WorkLogEntry as WorkLogEntrySchema,
	Project as ProjectSchema,
	ProjectCreateInput as ProjectCreateInputSchema,
	ProjectPatch as ProjectPatchSchema,
	type Task,
	type WorkLogEntry,
	type Project,
	type ProjectCreateInput,
	type ProjectPatch,
} from "./schema.js";
import {
	byUpdatedDescThenTitle,
	isStalerThan,
	listContexts as listContextsFromTasks,
} from "./query.js";
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
import type { TaskRepositoryService, ListProjectsFilters } from "./repository.js";
import {
	TaskRepository,
	applyListTaskFilters,
	applyListProjectFilters,
	todayIso,
	applyTaskPatch,
	applyWorkLogPatch,
	applyProjectPatch,
	buildInstanceFromTemplate,
	createTaskFromInput,
	createProjectFromInput,
} from "./repository.js";

const decodeTask = Schema.decodeUnknownSync(TaskSchema);
const decodeWorkLogCreateInput = Schema.decodeUnknownSync(
	WorkLogCreateInputSchema,
);
const decodeWorkLogEntry = Schema.decodeUnknownSync(WorkLogEntrySchema);
const decodeProject = Schema.decodeUnknownSync(ProjectSchema);
const decodeProjectCreateInput = Schema.decodeUnknownSync(ProjectCreateInputSchema);
const decodeProjectPatch = Schema.decodeUnknownSync(ProjectPatchSchema);

const toErrorMessage = (error: unknown): string => {
	if (error !== null && typeof error === "object" && "_tag" in error) {
		const tagged = error as { _tag: string; message?: string };
		return tagged.message ?? tagged._tag;
	}
	return error instanceof Error ? error.message : String(error);
};

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

export interface ProseqlRepositoryOptions {
	readonly tasksFile: string;
	readonly workLogFile: string;
	readonly tasksFormat?: string;
	readonly workLogFormat?: string;
	readonly hooksDir?: string;
	readonly hookEnv?: NodeJS.ProcessEnv;
}

const makeDbConfig = (options: ProseqlRepositoryOptions) =>
	({
		tasks: {
			schema: TaskSchema,
			file: options.tasksFile,
			...(options.tasksFormat !== undefined
				? { format: options.tasksFormat }
				: {}),
			relationships: {},
		},
		workLog: {
			schema: WorkLogEntrySchema,
			file: options.workLogFile,
			...(options.workLogFormat !== undefined
				? { format: options.workLogFormat }
				: {}),
			relationships: {},
		},
		projects: {
			schema: ProjectSchema,
			file: join(dirname(options.tasksFile), "projects.yaml"),
			relationships: {},
		},
	}) as const;

const makeProseqlRepository = (
	options: ProseqlRepositoryOptions,
): Effect.Effect<TaskRepositoryService, string, Scope.Scope> =>
	Effect.gen(function* () {
		const config = makeDbConfig(options);

		const db: any = yield* createNodeDatabase(config).pipe(
			Effect.mapError(
				(error: unknown) =>
					`ProseqlRepository failed to initialize database: ${toErrorMessage(error)}`,
			),
		);

		const dataDir = dirname(options.tasksFile);

		const hookRuntimeOptions: HookRuntimeOptions = {
			hooksDir: options.hooksDir,
			env: options.hookEnv,
			dataDir,
		};

		const collectTasks = (): Effect.Effect<Array<Task>, string> =>
			Effect.tryPromise({
				try: () =>
					db.tasks.query().runPromise.then((results: unknown[]) =>
						results as Array<Task>,
					),
				catch: (error: unknown) =>
					`ProseqlRepository.listTasks failed: ${toErrorMessage(error)}`,
			});

		const collectWorkLog = (): Effect.Effect<Array<WorkLogEntry>, string> =>
			Effect.tryPromise({
				try: () =>
					db.workLog.query().runPromise.then((results: unknown[]) =>
						results as Array<WorkLogEntry>,
					),
				catch: (error: unknown) =>
					`ProseqlRepository.listWorkLog failed: ${toErrorMessage(error)}`,
			});

		const findTask = (id: string): Effect.Effect<Task, string> =>
			Effect.tryPromise({
				try: () => db.tasks.findById(id).runPromise as Promise<Task>,
				catch: (error) =>
					`ProseqlRepository failed to read task ${id}: ${toErrorMessage(error)}`,
			});

		const findWorkLogEntry = (
			id: string,
		): Effect.Effect<WorkLogEntry, string> =>
			Effect.tryPromise({
				try: () =>
					db.workLog.findById(id).runPromise as Promise<WorkLogEntry>,
				catch: (error) =>
					`ProseqlRepository failed to read work log entry ${id}: ${toErrorMessage(error)}`,
			});

		const saveTask = (task: Task): Effect.Effect<Task, string> =>
			Effect.tryPromise({
				try: () =>
					db.tasks
						.upsert({
							where: { id: task.id },
							create: task,
							update: task,
						})
						.runPromise.then((r: any) => r as Task),
				catch: (error: unknown) =>
					`ProseqlRepository failed to write task ${task.id}: ${toErrorMessage(error)}`,
			});

		const removeTask = (id: string): Effect.Effect<Task, string> =>
			Effect.tryPromise({
				try: () => db.tasks.delete(id).runPromise as Promise<Task>,
				catch: (error) =>
					`ProseqlRepository failed to delete task ${id}: ${toErrorMessage(error)}`,
			});

		const saveWorkLogEntry = (
			entry: WorkLogEntry,
		): Effect.Effect<WorkLogEntry, string> =>
			Effect.tryPromise({
				try: () =>
					db.workLog
						.upsert({
							where: { id: entry.id },
							create: entry,
							update: entry,
						})
						.runPromise.then(
							(r: any) => r as WorkLogEntry,
						),
				catch: (error: unknown) =>
					`ProseqlRepository failed to write work log entry ${entry.id}: ${toErrorMessage(error)}`,
			});

		const removeWorkLogEntry = (
			id: string,
		): Effect.Effect<WorkLogEntry, string> =>
			Effect.tryPromise({
				try: () =>
					db.workLog.delete(id).runPromise as Promise<WorkLogEntry>,
				catch: (error) =>
					`ProseqlRepository failed to delete work log entry ${id}: ${toErrorMessage(error)}`,
			});

		const collectProjects = (): Effect.Effect<Array<Project>, string> =>
			Effect.tryPromise({
				try: () =>
					db.projects.query().runPromise.then((results: unknown[]) =>
						results as Array<Project>,
					),
				catch: (error: unknown) =>
					`ProseqlRepository.listProjects failed: ${toErrorMessage(error)}`,
			});

		const findProject = (id: string): Effect.Effect<Project, string> =>
			Effect.tryPromise({
				try: () => db.projects.findById(id).runPromise as Promise<Project>,
				catch: (error) =>
					`ProseqlRepository failed to read project ${id}: ${toErrorMessage(error)}`,
			});

		const saveProject = (project: Project): Effect.Effect<Project, string> =>
			Effect.tryPromise({
				try: () =>
					db.projects
						.upsert({
							where: { id: project.id },
							create: project,
							update: project,
						})
						.runPromise.then((r: any) => r as Project),
				catch: (error: unknown) =>
					`ProseqlRepository failed to write project ${project.id}: ${toErrorMessage(error)}`,
			});

		const removeProject = (id: string): Effect.Effect<Project, string> =>
			Effect.tryPromise({
				try: () => db.projects.delete(id).runPromise as Promise<Project>,
				catch: (error) =>
					`ProseqlRepository failed to delete project ${id}: ${toErrorMessage(error)}`,
			});

		const writeDailyHighlight = (id: string): Effect.Effect<void, string> =>
			Effect.tryPromise({
				try: async () => {
					const highlightPath = join(dataDir, "daily-highlight.yaml");
					await mkdir(dataDir, { recursive: true });
					await writeFile(
						highlightPath,
						YAML.stringify({ id }),
						"utf8",
					);
				},
				catch: (error) =>
					`ProseqlRepository failed to write daily highlight ${id}: ${toErrorMessage(error)}`,
			});

		const byStartedAtDescThenId = (
			a: WorkLogEntry,
			b: WorkLogEntry,
		): number => {
			const byStartedAtDesc = b.started_at.localeCompare(a.started_at);
			if (byStartedAtDesc !== 0) {
				return byStartedAtDesc;
			}
			return a.id.localeCompare(b.id);
		};

		const readDailyHighlight = (): Effect.Effect<Task | null, string> =>
			Effect.gen(function* () {
				const highlightPath = join(dataDir, "daily-highlight.yaml");
				const source = yield* Effect.tryPromise({
					try: () =>
						readFile(highlightPath, "utf8").catch(
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
						`ProseqlRepository failed to read daily highlight: ${toErrorMessage(error)}`,
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
					Effect.map(findTask(parsed.id), (t) => t as Task | null),
					() => Effect.succeed(null as Task | null),
				);
				return result;
			});

		const service: TaskRepositoryService = {
			listTasks: (filters) =>
				Effect.map(collectTasks(), (tasks) =>
					applyListTaskFilters(tasks, filters),
				),

			getTask: (id) => findTask(id),

			createTask: (input) =>
				Effect.gen(function* () {
					const created = createTaskFromInput(input);
					const taskFromHooks = yield* runCreateHooks(
						created,
						hookRuntimeOptions,
					);
					yield* saveTask(taskFromHooks);
					return taskFromHooks;
				}),

			updateTask: (id, patch) =>
				Effect.gen(function* () {
					const existing = yield* findTask(id);
					const updated = applyTaskPatch(existing, patch);
					const taskFromHooks = yield* runModifyHooks(
						existing,
						updated,
						hookRuntimeOptions,
					);
					yield* saveTask(taskFromHooks);
					return taskFromHooks;
				}),

			completeTask: (id) =>
				Effect.gen(function* () {
					const existing = yield* findTask(id);
					const completedAt = new Date().toISOString();
					const completedDate = completedAt.slice(0, 10);

					const completedTask = decodeTask({
						...existing,
						status: "done",
						updated: completedDate,
						completed_at: completedAt,
					});

					const nextRecurringTask = yield* buildCompletionRecurrenceTask(
						completedTask,
						completedAt,
					);

					yield* saveTask(completedTask);
					yield* runNonMutatingHooks(
						"complete",
						completedTask,
						hookRuntimeOptions,
					);

					if (nextRecurringTask !== null) {
						yield* saveTask(nextRecurringTask);
					}

					return completedTask;
				}),

			generateNextRecurrence: (id) =>
				Effect.gen(function* () {
					const existing = yield* findTask(id);
					const result = yield* buildNextClockRecurrenceTask(
						existing,
						new Date(),
					);

					if (result.updatedCurrent !== null) {
						yield* saveTask(result.updatedCurrent);
					}

					yield* saveTask(result.nextTask);
					return result.nextTask;
				}),

			processDueRecurrences: (now) =>
				Effect.gen(function* () {
					const tasks = yield* collectTasks();
					const recurringTasks = tasks.filter(
						(task) =>
							task.recurrence !== null &&
							task.recurrence_trigger === "clock" &&
							task.status !== "done" &&
							task.status !== "dropped",
					);

					const created: Array<Task> = [];
					const replaced: Array<string> = [];

					for (const task of recurringTasks) {
						const due = yield* isClockRecurrenceDue(task, now);
						if (!due) {
							continue;
						}

						const result = yield* buildNextClockRecurrenceTask(task, now);

						if (result.updatedCurrent !== null) {
							yield* saveTask(result.updatedCurrent);
						}

						yield* saveTask(result.nextTask);
						created.push(result.nextTask);
						if (result.shouldReplaceCurrent) {
							replaced.push(task.id);
						}
					}

					return { created, replaced } as const;
				}),

			deleteTask: (id) =>
				Effect.gen(function* () {
					const existing = yield* findTask(id);
					yield* removeTask(id);
					yield* runNonMutatingHooks(
						"delete",
						existing,
						hookRuntimeOptions,
					);
					return { deleted: true } as const;
				}),

			setDailyHighlight: (id) =>
				Effect.gen(function* () {
					const existing = yield* findTask(id);
					yield* writeDailyHighlight(id);
					return existing;
				}),

			getDailyHighlight: () => readDailyHighlight(),

			listStale: (days) =>
				Effect.map(collectTasks(), (tasks) => {
					const stalePredicate = isStalerThan(days, todayIso());
					return tasks
						.filter(
							(task) => task.status === "active" && stalePredicate(task),
						)
						.sort(byUpdatedDescThenTitle);
				}),

			listWorkLog: (filters) =>
				Effect.map(collectWorkLog(), (entries) =>
					entries
						.filter((entry) =>
							filters?.date !== undefined
								? entry.date === filters.date
								: true,
						)
						.sort(byStartedAtDescThenId),
				),

			createWorkLogEntry: (input) =>
				Effect.gen(function* () {
					const normalizedInput = decodeWorkLogCreateInput(input);
					const timestamp = yield* toWorkLogTimestamp(
						normalizedInput.started_at,
					);
					const date = yield* toWorkLogDate(normalizedInput.started_at);

					const created = decodeWorkLogEntry({
						id: `${normalizedInput.task_id}-${timestamp}`,
						task_id: normalizedInput.task_id,
						started_at: normalizedInput.started_at,
						ended_at: normalizedInput.ended_at,
						date,
					});

					yield* saveWorkLogEntry(created);
					return created;
				}),

			updateWorkLogEntry: (id, patch) =>
				Effect.gen(function* () {
					const existing = yield* findWorkLogEntry(id);
					const updated = applyWorkLogPatch(existing, patch);
					yield* saveWorkLogEntry(updated);
					return updated;
				}),

			deleteWorkLogEntry: (id) =>
				Effect.gen(function* () {
					yield* removeWorkLogEntry(id);
					return { deleted: true } as const;
				}),

			importTask: (task) =>
				Effect.gen(function* () {
					yield* saveTask(task);
					return task;
				}),

			importWorkLogEntry: (entry) =>
				Effect.gen(function* () {
					yield* saveWorkLogEntry(entry);
					return entry;
				}),

			listProjects: (filters) =>
				Effect.map(collectProjects(), (projects) =>
					applyListProjectFilters(projects, filters),
				),

			getProject: (id) => findProject(id),

			createProject: (input) =>
				Effect.gen(function* () {
					const created = createProjectFromInput(input);
					yield* saveProject(created);
					return created;
				}),

			updateProject: (id, patch) =>
				Effect.gen(function* () {
					const existing = yield* findProject(id);
					const updated = applyProjectPatch(existing, patch);
					yield* saveProject(updated);
					return updated;
				}),

			deleteProject: (id) =>
				Effect.gen(function* () {
					yield* removeProject(id);
					return { deleted: true } as const;
				}),

			importProject: (project) =>
				Effect.gen(function* () {
					yield* saveProject(project);
					return project;
				}),

			listContexts: () =>
				Effect.map(collectTasks(), (tasks) =>
					listContextsFromTasks(tasks),
				),

			getRelated: (id) =>
				Effect.gen(function* () {
					const target = yield* findTask(id);
					const allTasks = yield* collectTasks();
					const targetRelated = new Set(target.related);
					return allTasks.filter(
						(t) =>
							t.id !== id &&
							(targetRelated.has(t.id) || t.related.includes(id)),
					);
				}),

			instantiateTemplate: (templateId, overrides) =>
				Effect.gen(function* () {
					const template = yield* findTask(templateId);

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
					yield* saveTask(taskFromHooks);
					return taskFromHooks;
				}),
		};

		return service;
	});

export const ProseqlRepositoryLive = (
	options: ProseqlRepositoryOptions,
): Layer.Layer<TaskRepository, string> =>
	Layer.scoped(TaskRepository, makeProseqlRepository(options));
