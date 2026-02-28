import { describe, expect, it } from "bun:test";
import {
	chmod,
	mkdtemp,
	mkdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import YAML from "yaml";
import type { Task, WorkLogEntry, Project } from "./schema.js";
import {
	applyListTaskFilters,
	applyTaskPatch,
	applyWorkLogPatch,
	applyProjectPatch,
	buildInstanceFromTemplate,
	createTaskFromInput,
	createProjectFromInput,
	discoverHooksForEvent,
	generateTaskId,
	parseTaskRecord,
	parseWorkLogRecord,
	parseProjectRecord,
	promoteSubtask,
	TaskRepository,
	TaskRepositoryLive,
	type ListTasksFilters,
	type ListProjectsFilters,
	type TaskRepositoryLiveOptions,
	type TaskRepositoryService,
	todayIso,
} from "./repository.js";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const baseTask = (): Task => ({
	id: "revive-unzen",
	title: "Revive unzen server",
	status: "active",
	area: "infrastructure",
	projects: ["homelab"],
	tags: ["hardware", "weekend"],
	created: "2026-02-16",
	updated: "2026-02-20",
	urgency: "high",
	energy: "high",
	due: "2026-03-01",
	context: "Mini-ITX build",
	subtasks: [
		{ text: "Test PSU", done: true },
		{ text: "Reassemble drives", done: false },
	],
	blocked_by: [],
	estimated_minutes: 240,
	actual_minutes: null,
	completed_at: null,
	last_surfaced: "2026-02-19",
	defer_until: null,
	nudge_count: 2,
	recurrence: "FREQ=WEEKLY;BYDAY=MO",
	recurrence_trigger: "clock",
	recurrence_strategy: "replace",
	recurrence_last_generated: "2026-02-24T08:00:00Z",
	related: [],
	is_template: false,
	from_template: null,
	priority: null,
	type: "task",
	assignee: null,
	parent: null,
	close_reason: null,
	description: "",
	comments: [],
});

const baseWorkLogEntry = (): WorkLogEntry => ({
	id: "revive-unzen-20260220T0900",
	task_id: "revive-unzen",
	started_at: "2026-02-20T09:00:00Z",
	ended_at: "2026-02-20T10:30:00Z",
	date: "2026-02-20",
});

const unexpectedCall = <A>(): Effect.Effect<A, string> =>
	Effect.fail("unexpected method call");

const makeRepositoryService = (
	overrides: Partial<TaskRepositoryService> = {},
): TaskRepositoryService => ({
	listTasks: () => Effect.succeed([]),
	getTask: () => unexpectedCall(),
	createTask: () => unexpectedCall(),
	updateTask: () => unexpectedCall(),
	completeTask: () => unexpectedCall(),
	generateNextRecurrence: () => unexpectedCall(),
	processDueRecurrences: () => unexpectedCall(),
	deleteTask: () => unexpectedCall(),
	setDailyHighlight: () => unexpectedCall(),
	getDailyHighlight: () => Effect.succeed(null),
	listStale: () => unexpectedCall(),
	listWorkLog: () => unexpectedCall(),
	createWorkLogEntry: () => unexpectedCall(),
	updateWorkLogEntry: () => unexpectedCall(),
	deleteWorkLogEntry: () => unexpectedCall(),
	importTask: () => unexpectedCall(),
	importWorkLogEntry: () => unexpectedCall(),
	listProjects: () => Effect.succeed([]),
	getProject: () => unexpectedCall(),
	createProject: () => unexpectedCall(),
	updateProject: () => unexpectedCall(),
	deleteProject: () => unexpectedCall(),
	importProject: () => unexpectedCall(),
	listContexts: () => Effect.succeed([]),
	getRelated: () => unexpectedCall(),
	instantiateTemplate: () => unexpectedCall(),
	...overrides,
});

const runListTasks = (
	dataDir: string,
	filters?: ListTasksFilters,
): Promise<Array<Task>> =>
	Effect.runPromise(
		Effect.gen(function* () {
			const repository = yield* TaskRepository;
			return yield* repository.listTasks(filters);
		}).pipe(Effect.provide(TaskRepositoryLive({ dataDir }))),
	);

const runDiscoverHooks = (
	event: Parameters<typeof discoverHooksForEvent>[0],
	options?: Parameters<typeof discoverHooksForEvent>[1],
): Promise<Array<string>> =>
	Effect.runPromise(discoverHooksForEvent(event, options));

const addDaysToIsoDate = (date: string, days: number): string => {
	const next = new Date(`${date}T00:00:00.000Z`);
	next.setUTCDate(next.getUTCDate() + days);
	return next.toISOString().slice(0, 10);
};

const runRepository = <A>(
	dataDir: string,
	run: (repository: TaskRepositoryService) => Effect.Effect<A, string>,
): Promise<A> => runRepositoryWithOptions({ dataDir }, run);

const runRepositoryWithOptions = <A>(
	options: TaskRepositoryLiveOptions,
	run: (repository: TaskRepositoryService) => Effect.Effect<A, string>,
): Promise<A> =>
	Effect.runPromise(
		Effect.gen(function* () {
			const repository = yield* TaskRepository;
			return yield* run(repository);
		}).pipe(Effect.provide(TaskRepositoryLive(options))),
	);

const runRepositoryExit = <A>(
	dataDir: string,
	run: (repository: TaskRepositoryService) => Effect.Effect<A, string>,
): Promise<Exit.Exit<A, string>> =>
	runRepositoryWithOptionsExit({ dataDir }, run);

const runRepositoryWithOptionsExit = <A>(
	options: TaskRepositoryLiveOptions,
	run: (repository: TaskRepositoryService) => Effect.Effect<A, string>,
): Promise<Exit.Exit<A, string>> =>
	Effect.runPromiseExit(
		Effect.gen(function* () {
			const repository = yield* TaskRepository;
			return yield* run(repository);
		}).pipe(Effect.provide(TaskRepositoryLive(options))),
	);

const writeTaskFiles = async (
	dataDir: string,
	tasks: ReadonlyArray<Task>,
): Promise<void> => {
	const tasksDir = join(dataDir, "tasks");
	await mkdir(tasksDir, { recursive: true });

	await Promise.all(
		tasks.map((task) =>
			writeFile(
				join(tasksDir, `${task.id}.yaml`),
				YAML.stringify(task),
				"utf8",
			),
		),
	);
};

const writeWorkLogFiles = async (
	dataDir: string,
	entries: ReadonlyArray<WorkLogEntry>,
): Promise<void> => {
	const workLogDir = join(dataDir, "work-log");
	await mkdir(workLogDir, { recursive: true });

	await Promise.all(
		entries.map((entry) =>
			writeFile(
				join(workLogDir, `${entry.id}.yaml`),
				YAML.stringify(entry),
				"utf8",
			),
		),
	);
};

const writeRawYamlFile = async (
	directory: string,
	fileName: string,
	source: string,
): Promise<void> => {
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, fileName), source, "utf8");
};

const writeExecutableHook = async (
	hooksDir: string,
	fileName: string,
	source: string,
): Promise<void> => {
	await mkdir(hooksDir, { recursive: true });
	const hookPath = join(hooksDir, fileName);
	await writeFile(hookPath, source, "utf8");
	await chmod(hookPath, 0o755);
};

describe("repository pure helpers", () => {
	it("generateTaskId slugifies title and appends a six character suffix", () => {
		const id = generateTaskId(" Repair   ARRAY!!! ");
		expect(id).toMatch(/^repair-array-[a-z0-9]{6}$/);
	});

	it("generateTaskId falls back to task slug when title has no slug content", () => {
		const id = generateTaskId("!!!");
		expect(id).toMatch(/^task-[a-z0-9]{6}$/);
	});

	it("todayIso returns an ISO calendar date", () => {
		expect(todayIso()).toMatch(isoDatePattern);
	});

	it("parseTaskRecord returns task for valid data and null for invalid data", () => {
		const task = baseTask();
		expect(parseTaskRecord(task)).toEqual(task);
		expect(parseTaskRecord({ ...task, status: 123 })).toBeNull();
	});

	it("parseWorkLogRecord returns entry for valid data and null for invalid data", () => {
		const entry = baseWorkLogEntry();
		expect(parseWorkLogRecord(entry)).toEqual(entry);
		expect(parseWorkLogRecord({ ...entry, ended_at: 123 })).toBeNull();
	});

	it("createTaskFromInput applies defaults and generates a task id", () => {
		const created = createTaskFromInput({ title: "Capture outage notes" });

		expect(created.id).toMatch(/^capture-outage-notes-[a-z0-9]{6}$/);
		expect(created).toMatchObject({
			title: "Capture outage notes",
			status: "active",
			area: "personal",
			projects: [],
			tags: [],
			urgency: "medium",
			energy: "medium",
			due: null,
			context: "",
			subtasks: [],
			blocked_by: [],
			estimated_minutes: null,
			actual_minutes: null,
			completed_at: null,
			last_surfaced: null,
			defer_until: null,
			nudge_count: 0,
			recurrence: null,
			recurrence_trigger: "clock",
			recurrence_strategy: "replace",
			recurrence_last_generated: null,
		});
		expect(created.created).toMatch(isoDatePattern);
		expect(created.updated).toMatch(isoDatePattern);
	});

	it("applyTaskPatch merges patch fields and always refreshes updated date", () => {
		const task = baseTask();
		const patched = applyTaskPatch(task, {
			title: "Repair array",
			tags: ["hardware"],
			updated: "1999-01-01",
		});

		expect(patched.title).toBe("Repair array");
		expect(patched.tags).toEqual(["hardware"]);
		expect(patched.updated).toBe(todayIso());
		expect(patched.id).toBe(task.id);
		expect(patched.created).toBe(task.created);
	});

	it("applyTaskPatch strips from_template from patch to enforce read-only", () => {
		const task = { ...baseTask(), from_template: "original-template" };
		const patched = applyTaskPatch(task, {
			title: "New title",
			from_template: "sneaky-override",
		});

		expect(patched.from_template).toBe("original-template");
		expect(patched.title).toBe("New title");
	});

	it("applyWorkLogPatch merges only provided fields", () => {
		const entry = baseWorkLogEntry();
		const patched = applyWorkLogPatch(entry, {
			ended_at: null,
			date: "2026-02-21",
		});

		expect(patched).toEqual({
			...entry,
			ended_at: null,
			date: "2026-02-21",
		});
	});

	it("discoverHooksForEvent returns empty when the hook directory does not exist", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-hooks-missing-"));
		try {
			const hooks = await runDiscoverHooks("create", {
				hooksDir: join(dataDir, "hooks"),
			});
			expect(hooks).toEqual([]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("discoverHooksForEvent finds only executable matching hooks in lexicographic order", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-hooks-discovery-"));
		const hooksDir = join(dataDir, "hooks");

		try {
			await mkdir(hooksDir, { recursive: true });

			await writeFile(
				join(hooksDir, "on-create"),
				"#!/usr/bin/env bash\n",
				"utf8",
			);
			await chmod(join(hooksDir, "on-create"), 0o755);

			await writeFile(
				join(hooksDir, "on-create.10-second"),
				"#!/usr/bin/env bash\n",
				"utf8",
			);
			await chmod(join(hooksDir, "on-create.10-second"), 0o755);

			await writeFile(
				join(hooksDir, "on-create.20-not-executable"),
				"#!/usr/bin/env bash\n",
				"utf8",
			);
			await chmod(join(hooksDir, "on-create.20-not-executable"), 0o644);

			await writeFile(
				join(hooksDir, "on-create-helper"),
				"#!/usr/bin/env bash\n",
				"utf8",
			);
			await chmod(join(hooksDir, "on-create-helper"), 0o755);

			await writeFile(
				join(hooksDir, "on-modify"),
				"#!/usr/bin/env bash\n",
				"utf8",
			);
			await chmod(join(hooksDir, "on-modify"), 0o755);

			const hooks = await runDiscoverHooks("create", { hooksDir });

			expect(hooks).toEqual([
				join(hooksDir, "on-create"),
				join(hooksDir, "on-create.10-second"),
			]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("discoverHooksForEvent resolves the XDG hook directory by default", async () => {
		const xdgConfigHome = await mkdtemp(join(tmpdir(), "tasks-hooks-xdg-"));
		const hooksDir = join(xdgConfigHome, "tashks", "hooks");

		try {
			await mkdir(hooksDir, { recursive: true });
			await writeFile(
				join(hooksDir, "on-create"),
				"#!/usr/bin/env bash\n",
				"utf8",
			);
			await chmod(join(hooksDir, "on-create"), 0o755);

			const hooks = await runDiscoverHooks("create", {
				env: {
					XDG_CONFIG_HOME: xdgConfigHome,
					HOME: "/home/ignored",
				},
			});

			expect(hooks).toEqual([join(hooksDir, "on-create")]);
		} finally {
			await rm(xdgConfigHome, { recursive: true, force: true });
		}
	});
});

describe("TaskRepository listTasks", () => {
	it("returns all tasks sorted by updated desc then title asc when no filters are provided", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-list-sort-"));
		try {
			const tasks: Array<Task> = [
				{
					...baseTask(),
					id: "zeta",
					title: "Zeta",
					updated: "2026-02-20",
				},
				{
					...baseTask(),
					id: "alpha",
					title: "Alpha",
					updated: "2026-02-21",
				},
				{
					...baseTask(),
					id: "bravo",
					title: "Bravo",
					updated: "2026-02-21",
				},
			];
			await writeTaskFiles(dataDir, tasks);

			const result = await runListTasks(dataDir);

			expect(result.map((task) => task.id)).toEqual(["alpha", "bravo", "zeta"]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("applies status, area, project, tags, due, defer_until, and unblocked filters", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-list-filters-"));
		try {
			const tasks: Array<Task> = [
				{
					...baseTask(),
					id: "match-task",
					title: "Match task",
					status: "active",
					area: "work",
					projects: ["homelab"],
					tags: ["hardware", "weekend"],
					due: "2026-03-05",
					defer_until: "2026-03-01",
					updated: "2026-02-25",
					blocked_by: ["done-blocker"],
				},
				{
					...baseTask(),
					id: "done-blocker",
					title: "Done blocker",
					status: "done",
					area: "work",
					projects: ["homelab"],
					tags: ["ops"],
					due: null,
					defer_until: null,
					updated: "2026-02-22",
					blocked_by: [],
				},
				{
					...baseTask(),
					id: "active-blocker",
					title: "Active blocker",
					status: "active",
					area: "work",
					projects: [],
					tags: ["ops"],
					due: null,
					defer_until: null,
					updated: "2026-02-23",
					blocked_by: [],
				},
				{
					...baseTask(),
					id: "blocked-task",
					title: "Blocked task",
					status: "active",
					area: "work",
					projects: ["homelab"],
					tags: ["hardware"],
					due: "2026-03-05",
					defer_until: "2026-03-01",
					updated: "2026-02-24",
					blocked_by: ["active-blocker"],
				},
				{
					...baseTask(),
					id: "due-too-early",
					title: "Due too early",
					status: "active",
					area: "work",
					projects: ["homelab"],
					tags: ["hardware"],
					due: "2026-03-02",
					defer_until: "2026-03-01",
					updated: "2026-02-21",
					blocked_by: [],
				},
				{
					...baseTask(),
					id: "deferred-past-date",
					title: "Deferred past date",
					status: "active",
					area: "work",
					projects: ["homelab"],
					tags: ["hardware"],
					due: "2026-03-05",
					defer_until: "2026-03-10",
					updated: "2026-02-21",
					blocked_by: [],
				},
				{
					...baseTask(),
					id: "wrong-status",
					title: "Wrong status",
					status: "backlog",
					area: "work",
					projects: ["homelab"],
					tags: ["hardware"],
					due: "2026-03-05",
					defer_until: "2026-03-01",
					updated: "2026-02-21",
					blocked_by: [],
				},
				{
					...baseTask(),
					id: "wrong-area",
					title: "Wrong area",
					status: "active",
					area: "personal",
					projects: ["homelab"],
					tags: ["hardware"],
					due: "2026-03-05",
					defer_until: "2026-03-01",
					updated: "2026-02-21",
					blocked_by: [],
				},
				{
					...baseTask(),
					id: "wrong-project",
					title: "Wrong project",
					status: "active",
					area: "work",
					projects: ["side-quest"],
					tags: ["hardware"],
					due: "2026-03-05",
					defer_until: "2026-03-01",
					updated: "2026-02-21",
					blocked_by: [],
				},
				{
					...baseTask(),
					id: "wrong-tag",
					title: "Wrong tag",
					status: "active",
					area: "work",
					projects: ["homelab"],
					tags: ["errands"],
					due: "2026-03-05",
					defer_until: "2026-03-01",
					updated: "2026-02-21",
					blocked_by: [],
				},
				{
					...baseTask(),
					id: "due-too-late",
					title: "Due too late",
					status: "active",
					area: "work",
					projects: ["homelab"],
					tags: ["hardware"],
					due: "2026-03-09",
					defer_until: "2026-03-01",
					updated: "2026-02-21",
					blocked_by: [],
				},
			];
			await writeTaskFiles(dataDir, tasks);

			const result = await runListTasks(dataDir, {
				status: "active",
				area: "work",
				project: "homelab",
				tags: ["hardware", "important"],
				due_after: "2026-03-03",
				due_before: "2026-03-07",
				unblocked_only: true,
				date: "2026-03-05",
			});

			expect(result.map((task) => task.id)).toEqual(["match-task"]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});

describe("TaskRepository integration with literal YAML files", () => {
	it("decodes hand-written task YAML files and supports .yaml/.yml extensions", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-literal-task-yaml-"));
		try {
			await writeRawYamlFile(
				join(dataDir, "tasks"),
				"literal-primary.yaml",
				`id: literal-primary
title: Literal primary
status: active
area: code
project: tasks
tags:
  - yaml
  - literal
created: '2026-02-20'
updated: '2026-02-26'
urgency: high
energy: low
due: 2026-03-01
context: |
  Investigate parser behavior from sample files.
  Keep YAML formatting realistic.
subtasks:
  - text: Capture fixture
    done: true
  - text: Verify list sorting
    done: false
blocked_by: []
estimated_minutes: 30
actual_minutes: null
completed_at: null
last_surfaced: 2026-02-25
defer_until: null
nudge_count: 1
recurrence: FREQ=WEEKLY;BYDAY=MO
recurrence_trigger: clock
recurrence_strategy: replace
recurrence_last_generated: 2026-02-24T08:00:00Z
`,
			);

			await writeRawYamlFile(
				join(dataDir, "tasks"),
				"literal-secondary.yml",
				`id: literal-secondary
title: Literal secondary
status: active
area: code
project: null
tags: []
created: '2026-02-20'
updated: '2026-02-25'
urgency: medium
energy: medium
due: null
context: ''
subtasks: []
blocked_by:
  - literal-primary
estimated_minutes: null
actual_minutes: null
completed_at: null
last_surfaced: null
defer_until: null
nudge_count: 0
recurrence: null
recurrence_trigger: completion
recurrence_strategy: accumulate
recurrence_last_generated: null
`,
			);

			const listed = await runListTasks(dataDir);
			expect(listed.map((task) => task.id)).toEqual([
				"literal-primary",
				"literal-secondary",
			]);
			expect(listed[0]).toMatchObject({
				id: "literal-primary",
				area: "code",
				projects: ["tasks"],
				tags: ["yaml", "literal"],
				due: "2026-03-01",
				subtasks: [
					{ text: "Capture fixture", done: true },
					{ text: "Verify list sorting", done: false },
				],
			});

			const fetched = await runRepository(dataDir, (repository) =>
				repository.getTask("literal-secondary"),
			);
			expect(fetched).toMatchObject({
				id: "literal-secondary",
				projects: [],
				blocked_by: ["literal-primary"],
				recurrence_trigger: "completion",
				recurrence_strategy: "accumulate",
			});
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("decodes hand-written work log YAML files and applies date filtering", async () => {
		const dataDir = await mkdtemp(
			join(tmpdir(), "tasks-literal-worklog-yaml-"),
		);
		try {
			await writeRawYamlFile(
				join(dataDir, "work-log"),
				"literal-primary-20260226T0900.yaml",
				`id: literal-primary-20260226T0900
task_id: literal-primary
started_at: 2026-02-26T09:00:00Z
ended_at: 2026-02-26T10:15:00Z
date: 2026-02-26
`,
			);

			await writeRawYamlFile(
				join(dataDir, "work-log"),
				"literal-primary-20260225T0900.yml",
				`id: literal-primary-20260225T0900
task_id: literal-primary
started_at: 2026-02-25T09:00:00Z
ended_at: null
date: 2026-02-25
`,
			);

			const listed = await runRepository(dataDir, (repository) =>
				repository.listWorkLog(),
			);
			expect(listed.map((entry) => entry.id)).toEqual([
				"literal-primary-20260226T0900",
				"literal-primary-20260225T0900",
			]);
			expect(listed[0]).toMatchObject({
				task_id: "literal-primary",
				date: "2026-02-26",
				ended_at: "2026-02-26T10:15:00Z",
			});

			const filtered = await runRepository(dataDir, (repository) =>
				repository.listWorkLog({ date: "2026-02-25" }),
			);
			expect(filtered).toEqual([
				{
					id: "literal-primary-20260225T0900",
					task_id: "literal-primary",
					started_at: "2026-02-25T09:00:00Z",
					ended_at: null,
					date: "2026-02-25",
				},
			]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});

describe("TaskRepository service", () => {
	it("listStale returns only active tasks staler than the requested threshold", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-list-stale-"));
		try {
			const today = todayIso();
			const staleOld = addDaysToIsoDate(today, -30);
			const staleLessOld = addDaysToIsoDate(today, -20);
			const atBoundary = addDaysToIsoDate(today, -14);

			const tasks: Array<Task> = [
				{
					...baseTask(),
					id: "stale-a",
					title: "Stale A",
					status: "active",
					updated: staleOld,
				},
				{
					...baseTask(),
					id: "stale-b",
					title: "Stale B",
					status: "active",
					updated: staleLessOld,
				},
				{
					...baseTask(),
					id: "boundary",
					title: "Boundary",
					status: "active",
					updated: atBoundary,
				},
				{
					...baseTask(),
					id: "fresh",
					title: "Fresh",
					status: "active",
					updated: today,
				},
				{
					...baseTask(),
					id: "done-stale",
					title: "Done stale",
					status: "done",
					updated: staleOld,
				},
			];
			await writeTaskFiles(dataDir, tasks);

			const result = await runRepository(dataDir, (repository) =>
				repository.listStale(14),
			);

			expect(result.map((task) => task.id)).toEqual(["stale-b", "stale-a"]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("supports dependency injection via TaskRepository tag", async () => {
		const service = makeRepositoryService({
			listTasks: () => Effect.succeed([baseTask()]),
		});

		const tasks = await Effect.runPromise(
			Effect.gen(function* () {
				const repository = yield* TaskRepository;
				return yield* repository.listTasks({ status: "active" });
			}).pipe(Effect.provideService(TaskRepository, service)),
		);

		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.id).toBe("revive-unzen");
	});

	it("TaskRepositoryLive provides a service with all repository methods", async () => {
		const methodNames = await Effect.runPromise(
			Effect.gen(function* () {
				const repository = yield* TaskRepository;
				return Object.keys(repository).sort();
			}).pipe(Effect.provide(TaskRepositoryLive())),
		);

		expect(methodNames).toEqual([
			"completeTask",
			"createProject",
			"createTask",
			"createWorkLogEntry",
			"deleteProject",
			"deleteTask",
			"deleteWorkLogEntry",
			"generateNextRecurrence",
			"getDailyHighlight",
			"getProject",
			"getRelated",
			"getTask",
			"importProject",
			"importTask",
			"importWorkLogEntry",
			"instantiateTemplate",
			"listContexts",
			"listProjects",
			"listStale",
			"listTasks",
			"listWorkLog",
			"processDueRecurrences",
			"setDailyHighlight",
			"updateProject",
			"updateTask",
			"updateWorkLogEntry",
		]);
	});

	it("createTask writes a task that can be retrieved by getTask", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-create-get-"));
		try {
			const created = await runRepository(dataDir, (repository) =>
				repository.createTask({
					title: "Capture outage notes",
					projects: ["ops"],
					tags: ["incident"],
					area: "work",
				}),
			);

			const storedSource = await readFile(
				join(dataDir, "tasks", `${created.id}.yaml`),
				"utf8",
			);
			const stored = YAML.parse(storedSource);

			expect(created.id).toMatch(/^capture-outage-notes-[a-z0-9]{6}$/);
			expect(stored).toEqual(created);

			const fetched = await runRepository(dataDir, (repository) =>
				repository.getTask(created.id),
			);
			expect(fetched).toEqual(created);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("createTask fails when related references a template", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-create-tmpl-ref-"));
		try {
			const template: Task = {
				...baseTask(),
				id: "tmpl-1",
				title: "Template",
				is_template: true,
				recurrence: null,
			};
			await writeTaskFiles(dataDir, [template]);

			const result = await runRepositoryExit(dataDir, (repository) =>
				repository.createTask({
					title: "Normal task",
					related: ["tmpl-1"],
				}),
			);
			expect(Exit.isFailure(result)).toBe(true);
			if (Exit.isFailure(result)) {
				const failure = Option.getOrNull(Cause.failureOption(result.cause));
				expect(failure).toContain("Cannot reference template(s) in related");
			}
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("updateTask fails when related references a template", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-update-tmpl-ref-"));
		try {
			const template: Task = {
				...baseTask(),
				id: "tmpl-1",
				title: "Template",
				is_template: true,
				recurrence: null,
			};
			await writeTaskFiles(dataDir, [baseTask(), template]);

			const result = await runRepositoryExit(dataDir, (repository) =>
				repository.updateTask("revive-unzen", {
					related: ["tmpl-1"],
				}),
			);
			expect(Exit.isFailure(result)).toBe(true);
			if (Exit.isFailure(result)) {
				const failure = Option.getOrNull(Cause.failureOption(result.cause));
				expect(failure).toContain("Cannot reference template(s) in related");
			}
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("updateTask merges the patch, refreshes updated, and persists the result", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-update-"));
		try {
			await writeTaskFiles(dataDir, [baseTask()]);

			const updated = await runRepository(dataDir, (repository) =>
				repository.updateTask("revive-unzen", {
					title: "Repair array",
					tags: ["storage"],
					updated: "1999-01-01",
				}),
			);

			expect(updated.title).toBe("Repair array");
			expect(updated.tags).toEqual(["storage"]);
			expect(updated.updated).toBe(todayIso());

			const fetched = await runRepository(dataDir, (repository) =>
				repository.getTask("revive-unzen"),
			);
			expect(fetched).toEqual(updated);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("createTask applies on-create mutating hooks in order", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-create-hook-"));
		const hooksDir = join(dataDir, "hooks");
		try {
			await writeExecutableHook(
				hooksDir,
				"on-create",
				`#!/usr/bin/env node
const fs = require("node:fs");
const task = JSON.parse(fs.readFileSync(0, "utf8"));
task.tags = [...task.tags, "hooked"];
task.context = "Mutated by on-create";
process.stdout.write(JSON.stringify(task));
`,
			);

			const created = await runRepositoryWithOptions(
				{ dataDir, hooksDir },
				(repository) =>
					repository.createTask({
						title: "Capture outage notes",
						area: "work",
					}),
			);

			expect(created.tags).toEqual(["hooked"]);
			expect(created.context).toBe("Mutated by on-create");

			const storedSource = await readFile(
				join(dataDir, "tasks", `${created.id}.yaml`),
				"utf8",
			);
			expect(YAML.parse(storedSource)).toEqual(created);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("createTask hooks receive TASHKS_EVENT, TASHKS_ID, and TASHKS_DATA_DIR", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-create-hook-env-"));
		const hooksDir = join(dataDir, "hooks");
		const markerPath = join(dataDir, "on-create-env.json");
		try {
			await writeExecutableHook(
				hooksDir,
				"on-create",
				`#!/usr/bin/env node
const fs = require("node:fs");
const task = JSON.parse(fs.readFileSync(0, "utf8"));
const payload = {
  event: process.env.TASHKS_EVENT ?? null,
  id: process.env.TASHKS_ID ?? null,
  dataDir: process.env.TASHKS_DATA_DIR ?? null,
};
fs.writeFileSync(${JSON.stringify(markerPath)}, JSON.stringify(payload), "utf8");
process.stdout.write(JSON.stringify(task));
`,
			);

			const created = await runRepositoryWithOptions(
				{ dataDir, hooksDir },
				(repository) =>
					repository.createTask({
						title: "Capture outage notes",
					}),
			);

			const payload = JSON.parse(await readFile(markerPath, "utf8"));
			expect(payload).toEqual({
				event: "create",
				id: created.id,
				dataDir,
			});
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("updateTask applies on-modify mutating hooks using old and new task payload", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-update-hook-"));
		const hooksDir = join(dataDir, "hooks");
		try {
			await writeTaskFiles(dataDir, [baseTask()]);
			await writeExecutableHook(
				hooksDir,
				"on-modify",
				`#!/usr/bin/env node
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(0, "utf8"));
payload.new.context = payload.old.title + " -> " + payload.new.title;
payload.new.tags = [...payload.new.tags, "modified-hook"];
process.stdout.write(JSON.stringify(payload.new));
`,
			);

			const updated = await runRepositoryWithOptions(
				{ dataDir, hooksDir },
				(repository) =>
					repository.updateTask("revive-unzen", {
						title: "Repair array",
					}),
			);

			expect(updated.title).toBe("Repair array");
			expect(updated.context).toBe("Revive unzen server -> Repair array");
			expect(updated.tags).toEqual(["hardware", "weekend", "modified-hook"]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("updateTask hooks receive TASHKS_EVENT, TASHKS_ID, and TASHKS_DATA_DIR", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-update-hook-env-"));
		const hooksDir = join(dataDir, "hooks");
		const markerPath = join(dataDir, "on-modify-env.json");
		try {
			await writeTaskFiles(dataDir, [baseTask()]);
			await writeExecutableHook(
				hooksDir,
				"on-modify",
				`#!/usr/bin/env node
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(0, "utf8"));
const envPayload = {
  event: process.env.TASHKS_EVENT ?? null,
  id: process.env.TASHKS_ID ?? null,
  dataDir: process.env.TASHKS_DATA_DIR ?? null,
};
fs.writeFileSync(${JSON.stringify(markerPath)}, JSON.stringify(envPayload), "utf8");
process.stdout.write(JSON.stringify(payload.new));
`,
			);

			await runRepositoryWithOptions({ dataDir, hooksDir }, (repository) =>
				repository.updateTask("revive-unzen", {
					title: "Repair array",
				}),
			);

			const payload = JSON.parse(await readFile(markerPath, "utf8"));
			expect(payload).toEqual({
				event: "modify",
				id: "revive-unzen",
				dataDir,
			});
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("createTask aborts when an on-create hook exits non-zero", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-create-hook-fail-"));
		const hooksDir = join(dataDir, "hooks");
		try {
			await writeExecutableHook(
				hooksDir,
				"on-create",
				`#!/usr/bin/env bash
echo "create hook rejected task" >&2
exit 23
`,
			);

			const result = await runRepositoryWithOptionsExit(
				{ dataDir, hooksDir },
				(repository) =>
					repository.createTask({
						title: "Should fail",
					}),
			);
			expect(Exit.isFailure(result)).toBe(true);

			if (Exit.isFailure(result)) {
				const failure = Option.getOrNull(Cause.failureOption(result.cause));
				expect(failure).toContain("create hook rejected task");
			}

			const listed = await runListTasks(dataDir);
			expect(listed).toEqual([]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("updateTask aborts when an on-modify hook exits non-zero", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-update-hook-fail-"));
		const hooksDir = join(dataDir, "hooks");
		try {
			await writeTaskFiles(dataDir, [baseTask()]);
			await writeExecutableHook(
				hooksDir,
				"on-modify",
				`#!/usr/bin/env bash
echo "modify hook rejected patch" >&2
exit 19
`,
			);

			const result = await runRepositoryWithOptionsExit(
				{ dataDir, hooksDir },
				(repository) =>
					repository.updateTask("revive-unzen", {
						title: "Repair array",
					}),
			);
			expect(Exit.isFailure(result)).toBe(true);

			if (Exit.isFailure(result)) {
				const failure = Option.getOrNull(Cause.failureOption(result.cause));
				expect(failure).toContain("modify hook rejected patch");
			}

			const fetched = await runRepository(dataDir, (repository) =>
				repository.getTask("revive-unzen"),
			);
			expect(fetched.title).toBe("Revive unzen server");
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("updateTask aborts when an on-modify hook changes task id", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-update-hook-id-"));
		const hooksDir = join(dataDir, "hooks");
		try {
			await writeTaskFiles(dataDir, [baseTask()]);
			await writeExecutableHook(
				hooksDir,
				"on-modify",
				`#!/usr/bin/env node
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(0, "utf8"));
payload.new.id = "mutated-id";
process.stdout.write(JSON.stringify(payload.new));
`,
			);

			const result = await runRepositoryWithOptionsExit(
				{ dataDir, hooksDir },
				(repository) =>
					repository.updateTask("revive-unzen", {
						title: "Repair array",
					}),
			);
			expect(Exit.isFailure(result)).toBe(true);

			if (Exit.isFailure(result)) {
				const failure = Option.getOrNull(Cause.failureOption(result.cause));
				expect(failure).toContain("on-modify hooks cannot change task id");
			}

			const fetched = await runRepository(dataDir, (repository) =>
				repository.getTask("revive-unzen"),
			);
			expect(fetched.id).toBe("revive-unzen");
			expect(fetched.title).toBe("Revive unzen server");
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("completeTask runs on-complete hooks with the completed task payload", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-complete-hook-"));
		const hooksDir = join(dataDir, "hooks");
		const markerPath = join(dataDir, "on-complete.json");
		try {
			await writeTaskFiles(dataDir, [baseTask()]);
			await writeExecutableHook(
				hooksDir,
				"on-complete",
				`#!/usr/bin/env node
const fs = require("node:fs");
const task = JSON.parse(fs.readFileSync(0, "utf8"));
fs.writeFileSync(${JSON.stringify(markerPath)}, JSON.stringify(task), "utf8");
`,
			);

			const completed = await runRepositoryWithOptions(
				{ dataDir, hooksDir },
				(repository) => repository.completeTask("revive-unzen"),
			);
			expect(completed.status).toBe("done");

			const payload = JSON.parse(await readFile(markerPath, "utf8"));
			expect(payload.id).toBe("revive-unzen");
			expect(payload.status).toBe("done");
			expect(payload.completed_at).toBe(completed.completed_at);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("completeTask hooks receive TASHKS_EVENT, TASHKS_ID, and TASHKS_DATA_DIR", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-complete-hook-env-"));
		const hooksDir = join(dataDir, "hooks");
		const markerPath = join(dataDir, "on-complete-env.json");
		try {
			await writeTaskFiles(dataDir, [baseTask()]);
			await writeExecutableHook(
				hooksDir,
				"on-complete",
				`#!/usr/bin/env node
const fs = require("node:fs");
const task = JSON.parse(fs.readFileSync(0, "utf8"));
const payload = {
  event: process.env.TASHKS_EVENT ?? null,
  id: process.env.TASHKS_ID ?? null,
  dataDir: process.env.TASHKS_DATA_DIR ?? null,
  taskId: task.id,
};
fs.writeFileSync(${JSON.stringify(markerPath)}, JSON.stringify(payload), "utf8");
`,
			);

			await runRepositoryWithOptions({ dataDir, hooksDir }, (repository) =>
				repository.completeTask("revive-unzen"),
			);

			const payload = JSON.parse(await readFile(markerPath, "utf8"));
			expect(payload).toEqual({
				event: "complete",
				id: "revive-unzen",
				dataDir,
				taskId: "revive-unzen",
			});
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("completeTask does not fail when an on-complete hook exits non-zero", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-complete-hook-fail-"));
		const hooksDir = join(dataDir, "hooks");
		try {
			await writeTaskFiles(dataDir, [baseTask()]);
			await writeExecutableHook(
				hooksDir,
				"on-complete",
				`#!/usr/bin/env bash
echo "complete hook failed" >&2
exit 7
`,
			);

			const completed = await runRepositoryWithOptions(
				{ dataDir, hooksDir },
				(repository) => repository.completeTask("revive-unzen"),
			);
			expect(completed.status).toBe("done");

			const fetched = await runRepository(dataDir, (repository) =>
				repository.getTask("revive-unzen"),
			);
			expect(fetched.status).toBe("done");
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("completeTask marks the task done and does not create recurrence for clock-driven tasks", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-complete-clock-"));
		try {
			await writeTaskFiles(dataDir, [
				{
					...baseTask(),
					recurrence: "FREQ=DAILY",
					recurrence_trigger: "clock",
				},
			]);

			const completed = await runRepository(dataDir, (repository) =>
				repository.completeTask("revive-unzen"),
			);

			expect(completed.status).toBe("done");
			expect(completed.updated).toBe(todayIso());
			expect(completed.completed_at).not.toBeNull();

			const fetched = await runRepository(dataDir, (repository) =>
				repository.getTask("revive-unzen"),
			);
			expect(fetched).toEqual(completed);

			const listed = await runRepository(dataDir, (repository) =>
				repository.listTasks(),
			);
			expect(listed).toHaveLength(1);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("completeTask creates the next completion-driven recurrence instance", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-complete-recur-"));
		try {
			await writeTaskFiles(dataDir, [
				{
					...baseTask(),
					recurrence: "FREQ=WEEKLY;INTERVAL=2",
					recurrence_trigger: "completion",
					recurrence_last_generated: null,
				},
			]);

			const completed = await runRepository(dataDir, (repository) =>
				repository.completeTask("revive-unzen"),
			);
			expect(completed.status).toBe("done");
			expect(completed.completed_at).not.toBeNull();

			const listed = await runRepository(dataDir, (repository) =>
				repository.listTasks(),
			);
			expect(listed).toHaveLength(2);

			const next = listed.find((task) => task.id !== "revive-unzen");
			expect(next).toBeDefined();
			if (next === undefined || completed.completed_at === null) {
				throw new Error("Expected completed task and next recurrence task");
			}

			const completionDate = completed.completed_at.slice(0, 10);
			expect(next.id).toMatch(/^revive-unzen-server-[a-z0-9]{6}$/);
			expect(next.status).toBe("active");
			expect(next.created).toBe(completionDate);
			expect(next.updated).toBe(completionDate);
			expect(next.due).toBe(addDaysToIsoDate("2026-03-01", 14));
			expect(next.completed_at).toBeNull();
			expect(next.last_surfaced).toBeNull();
			expect(next.defer_until).toBe(addDaysToIsoDate(completionDate, 14));
			expect(next.nudge_count).toBe(0);
			expect(next.recurrence).toBe("FREQ=WEEKLY;INTERVAL=2");
			expect(next.recurrence_trigger).toBe("completion");
			expect(next.recurrence_last_generated).toBe(completed.completed_at);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("completeTask parses RRULE-prefixed completion recurrence strings", async () => {
		const dataDir = await mkdtemp(
			join(tmpdir(), "tasks-complete-recur-rrule-prefix-"),
		);
		try {
			await writeTaskFiles(dataDir, [
				{
					...baseTask(),
					recurrence: "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO",
					recurrence_trigger: "completion",
					recurrence_last_generated: null,
				},
			]);

			const completed = await runRepository(dataDir, (repository) =>
				repository.completeTask("revive-unzen"),
			);
			expect(completed.completed_at).not.toBeNull();

			const listed = await runRepository(dataDir, (repository) =>
				repository.listTasks(),
			);
			expect(listed).toHaveLength(2);

			const next = listed.find((task) => task.id !== "revive-unzen");
			expect(next).toBeDefined();
			if (next === undefined || completed.completed_at === null) {
				throw new Error("Expected completed task and next recurrence task");
			}

			const completionDate = completed.completed_at.slice(0, 10);
			expect(next.defer_until).toBe(addDaysToIsoDate(completionDate, 14));
			expect(next.recurrence).toBe("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO");
			expect(next.recurrence_trigger).toBe("completion");
			expect(next.recurrence_last_generated).toBe(completed.completed_at);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("completeTask creates completion-driven recurrence when strategy is accumulate", async () => {
		const dataDir = await mkdtemp(
			join(tmpdir(), "tasks-complete-recur-accumulate-"),
		);
		try {
			await writeTaskFiles(dataDir, [
				{
					...baseTask(),
					recurrence: "FREQ=WEEKLY;INTERVAL=1",
					recurrence_trigger: "completion",
					recurrence_strategy: "accumulate",
					recurrence_last_generated: null,
				},
			]);

			const completed = await runRepository(dataDir, (repository) =>
				repository.completeTask("revive-unzen"),
			);
			expect(completed.status).toBe("done");
			expect(completed.completed_at).not.toBeNull();

			const original = await runRepository(dataDir, (repository) =>
				repository.getTask("revive-unzen"),
			);
			expect(original.status).toBe("done");

			const listed = await runRepository(dataDir, (repository) =>
				repository.listTasks(),
			);
			expect(listed).toHaveLength(2);

			const next = listed.find((task) => task.id !== "revive-unzen");
			expect(next).toBeDefined();
			if (next === undefined || completed.completed_at === null) {
				throw new Error("Expected completed task and next recurrence task");
			}

			const completionDate = completed.completed_at.slice(0, 10);
			expect(next.status).toBe("active");
			expect(next.recurrence_trigger).toBe("completion");
			expect(next.recurrence_strategy).toBe("accumulate");
			expect(next.due).toBe(addDaysToIsoDate("2026-03-01", 7));
			expect(next.defer_until).toBe(addDaysToIsoDate(completionDate, 7));
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("generateNextRecurrence with replace drops the current instance and creates a new task", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-next-recur-replace-"));
		try {
			await writeTaskFiles(dataDir, [
				{
					...baseTask(),
					recurrence: "FREQ=WEEKLY;BYDAY=MO",
					recurrence_trigger: "clock",
					recurrence_strategy: "replace",
					recurrence_last_generated: null,
				},
			]);

			const next = await runRepository(dataDir, (repository) =>
				repository.generateNextRecurrence("revive-unzen"),
			);

			expect(next.id).toMatch(/^revive-unzen-server-[a-z0-9]{6}$/);
			expect(next.status).toBe("active");
			expect(next.created).toBe(todayIso());
			expect(next.updated).toBe(todayIso());
			expect(next.actual_minutes).toBeNull();
			expect(next.completed_at).toBeNull();
			expect(next.last_surfaced).toBeNull();
			expect(next.defer_until).toBeNull();
			expect(next.nudge_count).toBe(0);
			expect(next.recurrence).toBe("FREQ=WEEKLY;BYDAY=MO");
			expect(next.recurrence_last_generated).not.toBeNull();

			const replaced = await runRepository(dataDir, (repository) =>
				repository.getTask("revive-unzen"),
			);
			expect(replaced.status).toBe("dropped");
			expect(replaced.updated).toBe(todayIso());

			const listed = await runRepository(dataDir, (repository) =>
				repository.listTasks(),
			);
			expect(listed).toHaveLength(2);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("generateNextRecurrence with accumulate keeps the current instance active", async () => {
		const dataDir = await mkdtemp(
			join(tmpdir(), "tasks-next-recur-accumulate-"),
		);
		try {
			await writeTaskFiles(dataDir, [
				{
					...baseTask(),
					recurrence: "FREQ=DAILY",
					recurrence_trigger: "clock",
					recurrence_strategy: "accumulate",
					recurrence_last_generated: null,
				},
			]);

			const next = await runRepository(dataDir, (repository) =>
				repository.generateNextRecurrence("revive-unzen"),
			);
			expect(next.status).toBe("active");

			const original = await runRepository(dataDir, (repository) =>
				repository.getTask("revive-unzen"),
			);
			expect(original.status).toBe("active");

			const listed = await runRepository(dataDir, (repository) =>
				repository.listTasks(),
			);
			expect(listed).toHaveLength(2);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("processDueRecurrences creates due clock-driven tasks and reports replaced ids", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-process-due-replace-"));
		try {
			await writeTaskFiles(dataDir, [
				{
					...baseTask(),
					id: "clock-replace",
					title: "Clock replace",
					recurrence: "FREQ=DAILY",
					recurrence_trigger: "clock",
					recurrence_strategy: "replace",
					recurrence_last_generated: "2026-02-24T08:00:00Z",
					status: "active",
				},
				{
					...baseTask(),
					id: "completion-driven",
					title: "Completion driven",
					recurrence: "FREQ=DAILY",
					recurrence_trigger: "completion",
					recurrence_strategy: "replace",
					recurrence_last_generated: "2026-02-24T08:00:00Z",
					status: "active",
				},
				{
					...baseTask(),
					id: "done-clock",
					title: "Done clock",
					recurrence: "FREQ=DAILY",
					recurrence_trigger: "clock",
					recurrence_strategy: "replace",
					recurrence_last_generated: "2026-02-24T08:00:00Z",
					status: "done",
				},
			]);

			const now = new Date("2026-02-25T09:30:00.000Z");
			const result = await runRepository(dataDir, (repository) =>
				repository.processDueRecurrences(now),
			);

			expect(result.replaced).toEqual(["clock-replace"]);
			expect(result.created).toHaveLength(1);
			expect(result.created[0]?.id).toMatch(/^clock-replace-[a-z0-9]{6}$/);
			expect(result.created[0]?.recurrence_last_generated).toBe(
				"2026-02-25T09:30:00.000Z",
			);

			const replacedTask = await runRepository(dataDir, (repository) =>
				repository.getTask("clock-replace"),
			);
			expect(replacedTask.status).toBe("dropped");
			expect(replacedTask.recurrence_last_generated).toBe(
				"2026-02-25T09:30:00.000Z",
			);

			const allTasks = await runRepository(dataDir, (repository) =>
				repository.listTasks(),
			);
			expect(allTasks).toHaveLength(4);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("processDueRecurrences is idempotent for the same run timestamp", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-process-due-idem-"));
		try {
			await writeTaskFiles(dataDir, [
				{
					...baseTask(),
					id: "clock-accumulate",
					title: "Clock accumulate",
					recurrence: "FREQ=DAILY",
					recurrence_trigger: "clock",
					recurrence_strategy: "accumulate",
					recurrence_last_generated: "2026-02-24T08:00:00Z",
					status: "active",
				},
			]);

			const now = new Date("2026-02-25T09:30:00.000Z");
			const first = await runRepository(dataDir, (repository) =>
				repository.processDueRecurrences(now),
			);
			expect(first.created).toHaveLength(1);
			expect(first.replaced).toEqual([]);

			const second = await runRepository(dataDir, (repository) =>
				repository.processDueRecurrences(now),
			);
			expect(second).toEqual({
				created: [],
				replaced: [],
			});

			const original = await runRepository(dataDir, (repository) =>
				repository.getTask("clock-accumulate"),
			);
			expect(original.status).toBe("active");
			expect(original.recurrence_last_generated).toBe(
				"2026-02-25T09:30:00.000Z",
			);

			const allTasks = await runRepository(dataDir, (repository) =>
				repository.listTasks(),
			);
			expect(allTasks).toHaveLength(2);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("setDailyHighlight persists the highlighted task id and replaces previous highlight", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-highlight-"));
		try {
			const firstTask = {
				...baseTask(),
				id: "first-task",
				title: "First task",
			};
			const secondTask = {
				...baseTask(),
				id: "second-task",
				title: "Second task",
			};
			await writeTaskFiles(dataDir, [firstTask, secondTask]);

			const firstHighlight = await runRepository(dataDir, (repository) =>
				repository.setDailyHighlight("first-task"),
			);
			expect(firstHighlight.id).toBe("first-task");
			expect(
				YAML.parse(
					await readFile(join(dataDir, "daily-highlight.yaml"), "utf8"),
				),
			).toEqual({
				id: "first-task",
			});

			const secondHighlight = await runRepository(dataDir, (repository) =>
				repository.setDailyHighlight("second-task"),
			);
			expect(secondHighlight.id).toBe("second-task");
			expect(
				YAML.parse(
					await readFile(join(dataDir, "daily-highlight.yaml"), "utf8"),
				),
			).toEqual({
				id: "second-task",
			});
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("setDailyHighlight fails when the task does not exist", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-highlight-missing-"));
		try {
			const result = await runRepositoryExit(dataDir, (repository) =>
				repository.setDailyHighlight("missing-task"),
			);
			expect(Exit.isFailure(result)).toBe(true);

			if (Exit.isFailure(result)) {
				const failure = Option.getOrNull(Cause.failureOption(result.cause));
				expect(failure).toBe(
					"TaskRepository failed to read task missing-task: Task not found: missing-task",
				);
			}
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("deleteTask removes the task file and returns deleted", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-delete-"));
		try {
			await writeTaskFiles(dataDir, [baseTask()]);

			const deleted = await runRepository(dataDir, (repository) =>
				repository.deleteTask("revive-unzen"),
			);
			expect(deleted).toEqual({ deleted: true });

			const result = await runRepositoryExit(dataDir, (repository) =>
				repository.getTask("revive-unzen"),
			);
			expect(Exit.isFailure(result)).toBe(true);

			if (Exit.isFailure(result)) {
				const failure = Option.getOrNull(Cause.failureOption(result.cause));
				expect(failure).toBe(
					"TaskRepository failed to read task revive-unzen: Task not found: revive-unzen",
				);
			}
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("deleteTask runs on-delete hooks with the deleted task payload", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-delete-hook-"));
		const hooksDir = join(dataDir, "hooks");
		const markerPath = join(dataDir, "on-delete.json");
		try {
			await writeTaskFiles(dataDir, [baseTask()]);
			await writeExecutableHook(
				hooksDir,
				"on-delete",
				`#!/usr/bin/env node
const fs = require("node:fs");
const task = JSON.parse(fs.readFileSync(0, "utf8"));
fs.writeFileSync(${JSON.stringify(markerPath)}, JSON.stringify(task), "utf8");
`,
			);

			const deleted = await runRepositoryWithOptions(
				{ dataDir, hooksDir },
				(repository) => repository.deleteTask("revive-unzen"),
			);
			expect(deleted).toEqual({ deleted: true });

			const payload = JSON.parse(await readFile(markerPath, "utf8"));
			expect(payload.id).toBe("revive-unzen");
			expect(payload.title).toBe("Revive unzen server");
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("deleteTask hooks receive TASHKS_EVENT, TASHKS_ID, and TASHKS_DATA_DIR", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-delete-hook-env-"));
		const hooksDir = join(dataDir, "hooks");
		const markerPath = join(dataDir, "on-delete-env.json");
		try {
			await writeTaskFiles(dataDir, [baseTask()]);
			await writeExecutableHook(
				hooksDir,
				"on-delete",
				`#!/usr/bin/env node
const fs = require("node:fs");
const task = JSON.parse(fs.readFileSync(0, "utf8"));
const payload = {
  event: process.env.TASHKS_EVENT ?? null,
  id: process.env.TASHKS_ID ?? null,
  dataDir: process.env.TASHKS_DATA_DIR ?? null,
  taskId: task.id,
};
fs.writeFileSync(${JSON.stringify(markerPath)}, JSON.stringify(payload), "utf8");
`,
			);

			await runRepositoryWithOptions({ dataDir, hooksDir }, (repository) =>
				repository.deleteTask("revive-unzen"),
			);

			const payload = JSON.parse(await readFile(markerPath, "utf8"));
			expect(payload).toEqual({
				event: "delete",
				id: "revive-unzen",
				dataDir,
				taskId: "revive-unzen",
			});
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("deleteTask does not fail when an on-delete hook exits non-zero", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-delete-hook-fail-"));
		const hooksDir = join(dataDir, "hooks");
		try {
			await writeTaskFiles(dataDir, [baseTask()]);
			await writeExecutableHook(
				hooksDir,
				"on-delete",
				`#!/usr/bin/env bash
echo "delete hook failed" >&2
exit 5
`,
			);

			const deleted = await runRepositoryWithOptions(
				{ dataDir, hooksDir },
				(repository) => repository.deleteTask("revive-unzen"),
			);
			expect(deleted).toEqual({ deleted: true });

			const result = await runRepositoryExit(dataDir, (repository) =>
				repository.getTask("revive-unzen"),
			);
			expect(Exit.isFailure(result)).toBe(true);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("createWorkLogEntry persists a derived entry from create input", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-worklog-create-"));
		try {
			const created = await runRepository(dataDir, (repository) =>
				repository.createWorkLogEntry({
					task_id: "revive-unzen",
					started_at: "2026-02-20T09:00:00Z",
				}),
			);

			expect(created).toEqual({
				id: "revive-unzen-20260220T0900",
				task_id: "revive-unzen",
				started_at: "2026-02-20T09:00:00Z",
				ended_at: null,
				date: "2026-02-20",
			});

			const storedSource = await readFile(
				join(dataDir, "work-log", `${created.id}.yaml`),
				"utf8",
			);
			expect(YAML.parse(storedSource)).toEqual(created);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("listWorkLog applies date filtering and sorts by started_at descending", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-worklog-list-"));
		try {
			const entries: Array<WorkLogEntry> = [
				{
					...baseWorkLogEntry(),
					id: "revive-unzen-20260220T0900",
					started_at: "2026-02-20T09:00:00Z",
					date: "2026-02-20",
				},
				{
					...baseWorkLogEntry(),
					id: "revive-unzen-20260221T0800",
					started_at: "2026-02-21T08:00:00Z",
					date: "2026-02-21",
				},
				{
					...baseWorkLogEntry(),
					id: "revive-unzen-20260221T0900",
					started_at: "2026-02-21T09:00:00Z",
					date: "2026-02-21",
				},
			];
			await writeWorkLogFiles(dataDir, entries);

			const allEntries = await runRepository(dataDir, (repository) =>
				repository.listWorkLog(),
			);
			expect(allEntries.map((entry) => entry.id)).toEqual([
				"revive-unzen-20260221T0900",
				"revive-unzen-20260221T0800",
				"revive-unzen-20260220T0900",
			]);

			const filteredEntries = await runRepository(dataDir, (repository) =>
				repository.listWorkLog({ date: "2026-02-21" }),
			);
			expect(filteredEntries.map((entry) => entry.id)).toEqual([
				"revive-unzen-20260221T0900",
				"revive-unzen-20260221T0800",
			]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("updateWorkLogEntry merges and persists changes", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-worklog-update-"));
		try {
			await writeWorkLogFiles(dataDir, [baseWorkLogEntry()]);

			const updated = await runRepository(dataDir, (repository) =>
				repository.updateWorkLogEntry("revive-unzen-20260220T0900", {
					ended_at: null,
					date: "2026-02-21",
				}),
			);
			expect(updated).toEqual({
				...baseWorkLogEntry(),
				ended_at: null,
				date: "2026-02-21",
			});

			const listed = await runRepository(dataDir, (repository) =>
				repository.listWorkLog(),
			);
			expect(listed).toEqual([updated]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("deleteWorkLogEntry removes the entry file and returns deleted", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-worklog-delete-"));
		try {
			await writeWorkLogFiles(dataDir, [baseWorkLogEntry()]);

			const deleted = await runRepository(dataDir, (repository) =>
				repository.deleteWorkLogEntry("revive-unzen-20260220T0900"),
			);
			expect(deleted).toEqual({ deleted: true });

			const entries = await runRepository(dataDir, (repository) =>
				repository.listWorkLog(),
			);
			expect(entries).toEqual([]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});

const baseProject = (): Project => ({
	id: "homelab-refresh",
	title: "Homelab Refresh",
	status: "active",
	area: "infrastructure",
	description: "Refresh the homelab infrastructure",
	tags: ["hardware", "networking"],
	created: "2026-02-16",
	updated: "2026-02-20",
});

const writeProjectFiles = async (
	dataDir: string,
	projects: ReadonlyArray<Project>,
): Promise<void> => {
	const projectsDir = join(dataDir, "projects");
	await mkdir(projectsDir, { recursive: true });
	for (const project of projects) {
		await writeFile(
			join(projectsDir, `${project.id}.yaml`),
			YAML.stringify(project),
			"utf8",
		);
	}
};

describe("parseProjectRecord", () => {
	it("returns a valid Project for a complete record", () => {
		const record = baseProject();
		const result = parseProjectRecord(record);
		expect(result).toEqual(record);
	});

	it("returns null for an invalid record", () => {
		const result = parseProjectRecord({ title: "Missing fields" });
		expect(result).toBeNull();
	});

	it("returns null for non-object input", () => {
		expect(parseProjectRecord("not an object")).toBeNull();
		expect(parseProjectRecord(null)).toBeNull();
		expect(parseProjectRecord(42)).toBeNull();
	});
});

describe("createProjectFromInput", () => {
	it("creates a project with defaults", () => {
		const project = createProjectFromInput({ title: "New project" });
		expect(project.title).toBe("New project");
		expect(project.status).toBe("active");
		expect(project.area).toBe("personal");
		expect(project.description).toBe("");
		expect(project.tags).toEqual([]);
		expect(project.created).toMatch(isoDatePattern);
		expect(project.updated).toMatch(isoDatePattern);
		expect(project.id).toMatch(/^new-project-[a-z0-9]{6}$/);
	});

	it("creates a project with explicit fields", () => {
		const project = createProjectFromInput({
			title: "Homelab Refresh",
			status: "on-hold",
			area: "infrastructure",
			description: "Refresh the homelab",
			tags: ["hardware"],
		});
		expect(project.status).toBe("on-hold");
		expect(project.area).toBe("infrastructure");
		expect(project.description).toBe("Refresh the homelab");
		expect(project.tags).toEqual(["hardware"]);
	});
});

describe("applyProjectPatch", () => {
	it("updates specified fields and sets updated date", () => {
		const project = baseProject();
		const patched = applyProjectPatch(project, { title: "Updated Title", status: "on-hold" });
		expect(patched.title).toBe("Updated Title");
		expect(patched.status).toBe("on-hold");
		expect(patched.updated).toBe(todayIso());
		expect(patched.area).toBe("infrastructure");
		expect(patched.id).toBe("homelab-refresh");
	});

	it("does not change fields not in the patch", () => {
		const project = baseProject();
		const patched = applyProjectPatch(project, {});
		expect(patched.title).toBe(project.title);
		expect(patched.status).toBe(project.status);
		expect(patched.area).toBe(project.area);
		expect(patched.description).toBe(project.description);
		expect(patched.tags).toEqual(project.tags);
	});
});

describe("project CRUD via TaskRepositoryLive", () => {
	it("round-trips create → get → list → update → delete", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-project-crud-"));
		try {
			const repo = Effect.provide(TaskRepository, TaskRepositoryLive({ dataDir }));

			const created = await Effect.runPromise(
				Effect.flatMap(repo, (r) =>
					r.createProject({
						title: "Test Project",
						area: "infrastructure",
						tags: ["test"],
					}),
				),
			);

			expect(created.title).toBe("Test Project");
			expect(created.status).toBe("active");
			expect(created.area).toBe("infrastructure");
			expect(created.tags).toEqual(["test"]);
			expect(created.id).toMatch(/^test-project-[a-z0-9]{6}$/);

			const fetched = await Effect.runPromise(
				Effect.flatMap(repo, (r) => r.getProject(created.id)),
			);
			expect(fetched).toEqual(created);

			const listed = await Effect.runPromise(
				Effect.flatMap(repo, (r) => r.listProjects()),
			);
			expect(listed).toHaveLength(1);
			expect(listed[0]?.id).toBe(created.id);

			const updated = await Effect.runPromise(
				Effect.flatMap(repo, (r) =>
					r.updateProject(created.id, { status: "on-hold", description: "Updated" }),
				),
			);
			expect(updated.status).toBe("on-hold");
			expect(updated.description).toBe("Updated");
			expect(updated.updated).toBe(todayIso());

			const deleteResult = await Effect.runPromise(
				Effect.flatMap(repo, (r) => r.deleteProject(created.id)),
			);
			expect(deleteResult).toEqual({ deleted: true });

			const listedAfterDelete = await Effect.runPromise(
				Effect.flatMap(repo, (r) => r.listProjects()),
			);
			expect(listedAfterDelete).toEqual([]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("listProjects filters by status", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-project-filter-"));
		try {
			const active = { ...baseProject(), id: "proj-active", status: "active" as const };
			const onHold = { ...baseProject(), id: "proj-hold", status: "on-hold" as const, title: "On Hold" };
			await writeProjectFiles(dataDir, [active, onHold]);

			const repo = Effect.provide(TaskRepository, TaskRepositoryLive({ dataDir }));

			const activeOnly = await Effect.runPromise(
				Effect.flatMap(repo, (r) => r.listProjects({ status: "active" })),
			);
			expect(activeOnly).toHaveLength(1);
			expect(activeOnly[0]?.id).toBe("proj-active");

			const onHoldOnly = await Effect.runPromise(
				Effect.flatMap(repo, (r) => r.listProjects({ status: "on-hold" })),
			);
			expect(onHoldOnly).toHaveLength(1);
			expect(onHoldOnly[0]?.id).toBe("proj-hold");
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("listProjects filters by area", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-project-area-"));
		try {
			const infra = { ...baseProject(), id: "proj-infra", area: "infrastructure" as const };
			const work = { ...baseProject(), id: "proj-work", area: "work" as const, title: "Work Project" };
			await writeProjectFiles(dataDir, [infra, work]);

			const repo = Effect.provide(TaskRepository, TaskRepositoryLive({ dataDir }));

			const infraOnly = await Effect.runPromise(
				Effect.flatMap(repo, (r) => r.listProjects({ area: "infrastructure" })),
			);
			expect(infraOnly).toHaveLength(1);
			expect(infraOnly[0]?.id).toBe("proj-infra");
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("getProject fails for nonexistent project", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-project-notfound-"));
		try {
			const repo = Effect.provide(TaskRepository, TaskRepositoryLive({ dataDir }));

			const exit = await Effect.runPromiseExit(
				Effect.flatMap(repo, (r) => r.getProject("nonexistent")),
			);

			expect(Exit.isFailure(exit)).toBe(true);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("updateProject fails for nonexistent project", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-project-update-notfound-"));
		try {
			const repo = Effect.provide(TaskRepository, TaskRepositoryLive({ dataDir }));

			const exit = await Effect.runPromiseExit(
				Effect.flatMap(repo, (r) => r.updateProject("nonexistent", { title: "New" })),
			);

			expect(Exit.isFailure(exit)).toBe(true);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("deleteProject fails for nonexistent project", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-project-delete-notfound-"));
		try {
			const repo = Effect.provide(TaskRepository, TaskRepositoryLive({ dataDir }));

			const exit = await Effect.runPromiseExit(
				Effect.flatMap(repo, (r) => r.deleteProject("nonexistent")),
			);

			expect(Exit.isFailure(exit)).toBe(true);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("importProject writes a project that can be retrieved", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-project-import-"));
		try {
			const project = baseProject();
			const repo = Effect.provide(TaskRepository, TaskRepositoryLive({ dataDir }));

			const imported = await Effect.runPromise(
				Effect.flatMap(repo, (r) => r.importProject(project)),
			);
			expect(imported).toEqual(project);

			const fetched = await Effect.runPromise(
				Effect.flatMap(repo, (r) => r.getProject(project.id)),
			);
			expect(fetched).toEqual(project);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});

describe("parseTaskRecord migration", () => {
	it("migrates old project string to projects array", () => {
		const record = {
			...baseTask(),
			project: "homelab",
		};
		delete (record as any).projects;
		const result = parseTaskRecord(record);
		expect(result).not.toBeNull();
		expect(result!.projects).toEqual(["homelab"]);
	});

	it("migrates old project null to empty projects array", () => {
		const record = {
			...baseTask(),
			project: null,
		};
		delete (record as any).projects;
		const result = parseTaskRecord(record);
		expect(result).not.toBeNull();
		expect(result!.projects).toEqual([]);
	});

	it("does not migrate when projects already present", () => {
		const record = baseTask();
		const result = parseTaskRecord(record);
		expect(result).not.toBeNull();
		expect(result!.projects).toEqual(["homelab"]);
	});
});

describe("promoteSubtask", () => {
	it("promotes a subtask to a full task", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-promote-"));
		try {
			await writeTaskFiles(dataDir, [baseTask()]);

			const newTask = await runRepository(dataDir, (repository) =>
				promoteSubtask(repository, "revive-unzen", 1),
			);

			expect(newTask.title).toBe("Reassemble drives");
			expect(newTask.status).toBe("backlog");
			expect(newTask.projects).toEqual(["homelab"]);
			expect(newTask.area).toBe("infrastructure");
			expect(newTask.tags).toEqual(["hardware", "weekend"]);
			expect(newTask.blocked_by).toEqual(["revive-unzen"]);

			const parent = await runRepository(dataDir, (repository) =>
				repository.getTask("revive-unzen"),
			);
			expect(parent.subtasks).toHaveLength(1);
			expect(parent.subtasks[0]?.text).toBe("Test PSU");
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("promotes a done subtask with done status", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-promote-done-"));
		try {
			await writeTaskFiles(dataDir, [baseTask()]);

			const newTask = await runRepository(dataDir, (repository) =>
				promoteSubtask(repository, "revive-unzen", 0),
			);

			expect(newTask.title).toBe("Test PSU");
			expect(newTask.status).toBe("done");
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("fails for out-of-range index", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-promote-range-"));
		try {
			await writeTaskFiles(dataDir, [baseTask()]);

			const result = await runRepositoryExit(dataDir, (repository) =>
				promoteSubtask(repository, "revive-unzen", 5),
			);
			expect(Exit.isFailure(result)).toBe(true);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("refuses to promote subtasks on a template", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-promote-template-"));
		try {
			const templateTask: Task = {
				...baseTask(),
				is_template: true,
			};
			await writeTaskFiles(dataDir, [templateTask]);

			const result = await runRepositoryExit(dataDir, (repository) =>
				promoteSubtask(repository, "revive-unzen", 0),
			);
			expect(Exit.isFailure(result)).toBe(true);
			if (Exit.isFailure(result)) {
				const failure = Option.getOrNull(Cause.failureOption(result.cause));
				expect(failure).toContain("Cannot promote subtasks on a template");
			}
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});

describe("migrateTaskRecord", () => {
	it("adds defaults for new fields on old records", () => {
		const oldRecord = {
			id: "old-task",
			title: "Old task",
			status: "active",
			area: "personal",
			projects: [],
			tags: [],
			created: "2026-01-01",
			updated: "2026-01-01",
			urgency: "medium",
			energy: "medium",
			due: null,
			context: "",
			subtasks: [],
			blocked_by: [],
			estimated_minutes: null,
			actual_minutes: null,
			completed_at: null,
			last_surfaced: null,
			defer_until: null,
			nudge_count: 0,
			recurrence: null,
			recurrence_trigger: "clock",
			recurrence_strategy: "replace",
			recurrence_last_generated: null,
		};

		const parsed = parseTaskRecord(oldRecord);
		expect(parsed).not.toBeNull();
		expect(parsed!.related).toEqual([]);
		expect(parsed!.is_template).toBe(false);
		expect(parsed!.from_template).toBeNull();
	});
});

describe("applyListTaskFilters with new filters", () => {
	const makeTasks = (): Task[] => [
		{
			...baseTask(),
			id: "short",
			title: "Short",
			estimated_minutes: 10,
			context: "@home",
			is_template: false,
		},
		{
			...baseTask(),
			id: "medium",
			title: "Medium",
			estimated_minutes: 30,
			context: "@work",
			is_template: false,
		},
		{
			...baseTask(),
			id: "long",
			title: "Long",
			estimated_minutes: 60,
			context: "@home",
			is_template: false,
		},
		{
			...baseTask(),
			id: "template",
			title: "Template",
			estimated_minutes: null,
			context: "",
			is_template: true,
		},
	];

	it("filters by duration_min", () => {
		const result = applyListTaskFilters(makeTasks(), { duration_min: 25 });
		expect(result.map((t) => t.id)).toContain("medium");
		expect(result.map((t) => t.id)).toContain("long");
		expect(result.map((t) => t.id)).not.toContain("short");
	});

	it("filters by duration_max", () => {
		const result = applyListTaskFilters(makeTasks(), { duration_max: 30 });
		expect(result.map((t) => t.id)).toContain("short");
		expect(result.map((t) => t.id)).toContain("medium");
		expect(result.map((t) => t.id)).not.toContain("long");
	});

	it("filters by context", () => {
		const result = applyListTaskFilters(makeTasks(), { context: "@home" });
		expect(result.every((t) => t.context === "@home")).toBe(true);
	});

	it("excludes templates by default", () => {
		const result = applyListTaskFilters(makeTasks(), {});
		expect(result.map((t) => t.id)).not.toContain("template");
	});

	it("includes templates when include_templates is true", () => {
		const result = applyListTaskFilters(makeTasks(), { include_templates: true });
		expect(result.map((t) => t.id)).toContain("template");
	});
});

describe("buildInstanceFromTemplate", () => {
	it("creates instance with correct fields from template", () => {
		const template: Task = {
			...baseTask(),
			id: "weekly-prep",
			title: "Weekly Prep",
			is_template: true,
			subtasks: [
				{ text: "Buy groceries", done: true },
				{ text: "Meal plan", done: false },
			],
			related: ["other-task"],
		};

		const instance = buildInstanceFromTemplate(template);

		expect(instance.title).toBe("Weekly Prep");
		expect(instance.is_template).toBe(false);
		expect(instance.from_template).toBe("weekly-prep");
		expect(instance.status).toBe("backlog");
		expect(instance.id).not.toBe("weekly-prep");
		expect(instance.subtasks.every((s) => s.done === false)).toBe(true);
		expect(instance.subtasks.length).toBe(2);
		expect(instance.related).toEqual(["other-task"]);
		expect(instance.completed_at).toBeNull();
		expect(instance.actual_minutes).toBeNull();
		expect(instance.nudge_count).toBe(0);
		expect(instance.blocked_by).toEqual([]);
		expect(instance.recurrence).toBeNull();
		expect(instance.due).toBeNull();
		expect(instance.defer_until).toBeNull();
	});

	it("applies overrides", () => {
		const template: Task = {
			...baseTask(),
			id: "weekly-prep",
			title: "Weekly Prep",
			is_template: true,
		};

		const instance = buildInstanceFromTemplate(template, {
			title: "Custom Title",
			due: "2026-03-01",
			status: "active",
			projects: ["new-project"],
		});

		expect(instance.title).toBe("Custom Title");
		expect(instance.due).toBe("2026-03-01");
		expect(instance.status).toBe("active");
		expect(instance.projects).toEqual(["new-project"]);
	});
});

describe("instantiateTemplate via repository", () => {
	it("instantiates a template and writes it to disk", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-template-"));
		try {
			const template: Task = {
				...baseTask(),
				id: "weekly-prep",
				title: "Weekly Prep",
				is_template: true,
				recurrence: null,
			};
			await writeTaskFiles(dataDir, [template]);

			const instance = await runRepository(dataDir, (repository) =>
				repository.instantiateTemplate("weekly-prep"),
			);
			expect(instance.from_template).toBe("weekly-prep");
			expect(instance.is_template).toBe(false);
			expect(instance.status).toBe("backlog");
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("fails on non-template", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-template-fail-"));
		try {
			await writeTaskFiles(dataDir, [baseTask()]);

			const result = await runRepositoryExit(dataDir, (repository) =>
				repository.instantiateTemplate("revive-unzen"),
			);
			expect(Exit.isFailure(result)).toBe(true);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});

describe("getRelated", () => {
	it("returns bidirectionally related tasks", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-related-"));
		try {
			const task1: Task = {
				...baseTask(),
				id: "task-1",
				title: "Task 1",
				related: ["task-2"],
				recurrence: null,
			};
			const task2: Task = {
				...baseTask(),
				id: "task-2",
				title: "Task 2",
				related: [],
				recurrence: null,
			};
			const task3: Task = {
				...baseTask(),
				id: "task-3",
				title: "Task 3",
				related: ["task-1"],
				recurrence: null,
			};
			await writeTaskFiles(dataDir, [task1, task2, task3]);

			const related = await runRepository(dataDir, (repository) =>
				repository.getRelated("task-1"),
			);
			const ids = related.map((t) => t.id).sort();
			expect(ids).toEqual(["task-2", "task-3"]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});

describe("listContexts via repository", () => {
	it("returns sorted unique non-empty contexts", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-contexts-"));
		try {
			await writeTaskFiles(dataDir, [
				{ ...baseTask(), id: "t1", title: "T1", context: "@home", recurrence: null },
				{ ...baseTask(), id: "t2", title: "T2", context: "@work", recurrence: null },
				{ ...baseTask(), id: "t3", title: "T3", context: "@home", recurrence: null },
				{ ...baseTask(), id: "t4", title: "T4", context: "", recurrence: null },
			]);
			const contexts = await runRepository(dataDir, (r) => r.listContexts());
			expect(contexts).toEqual(["@home", "@work"]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});
