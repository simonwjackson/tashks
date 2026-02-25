import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import YAML from "yaml";
import type { Task, WorkLogEntry } from "./schema.js";
import {
	applyTaskPatch,
	applyWorkLogPatch,
	createTaskFromInput,
	generateTaskId,
	parseTaskRecord,
	parseWorkLogRecord,
	TaskRepository,
	TaskRepositoryLive,
	type ListTasksFilters,
	type TaskRepositoryService,
	todayIso,
} from "./repository.js";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const baseTask = (): Task => ({
	id: "revive-unzen",
	title: "Revive unzen server",
	status: "active",
	area: "infrastructure",
	project: "homelab",
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
	listStale: () => unexpectedCall(),
	listWorkLog: () => unexpectedCall(),
	createWorkLogEntry: () => unexpectedCall(),
	updateWorkLogEntry: () => unexpectedCall(),
	deleteWorkLogEntry: () => unexpectedCall(),
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

const addDaysToIsoDate = (date: string, days: number): string => {
	const next = new Date(`${date}T00:00:00.000Z`);
	next.setUTCDate(next.getUTCDate() + days);
	return next.toISOString().slice(0, 10);
};

const runRepository = <A>(
	dataDir: string,
	run: (repository: TaskRepositoryService) => Effect.Effect<A, string>,
): Promise<A> =>
	Effect.runPromise(
		Effect.gen(function* () {
			const repository = yield* TaskRepository;
			return yield* run(repository);
		}).pipe(Effect.provide(TaskRepositoryLive({ dataDir }))),
	);

const runRepositoryExit = <A>(
	dataDir: string,
	run: (repository: TaskRepositoryService) => Effect.Effect<A, string>,
): Promise<Exit.Exit<A, string>> =>
	Effect.runPromiseExit(
		Effect.gen(function* () {
			const repository = yield* TaskRepository;
			return yield* run(repository);
		}).pipe(Effect.provide(TaskRepositoryLive({ dataDir }))),
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
		expect(parseTaskRecord({ ...task, status: "invalid-status" })).toBeNull();
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
			project: null,
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
					project: "homelab",
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
					project: "homelab",
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
					project: null,
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
					project: "homelab",
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
					project: "homelab",
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
					project: "homelab",
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
					project: "homelab",
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
					project: "homelab",
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
					project: "side-quest",
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
					project: "homelab",
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
					project: "homelab",
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
				project: "tasks",
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
				project: null,
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
			"createTask",
			"createWorkLogEntry",
			"deleteTask",
			"deleteWorkLogEntry",
			"generateNextRecurrence",
			"getTask",
			"listStale",
			"listTasks",
			"listWorkLog",
			"processDueRecurrences",
			"setDailyHighlight",
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
					project: "ops",
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
