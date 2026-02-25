import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

describe("TaskRepository service", () => {
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
			"createTask",
			"createWorkLogEntry",
			"deleteTask",
			"deleteWorkLogEntry",
			"getTask",
			"listStale",
			"listTasks",
			"listWorkLog",
			"setDailyHighlight",
			"updateTask",
			"updateWorkLogEntry",
		]);
	});

	it("TaskRepositoryLive methods currently fail with not-implemented errors", async () => {
		const program = Effect.gen(function* () {
			const repository = yield* TaskRepository;
			return yield* repository.getTask("task-id");
		}).pipe(Effect.provide(TaskRepositoryLive({ dataDir: "/tmp/tasks-test" })));

		const result = await Effect.runPromiseExit(program);
		expect(Exit.isFailure(result)).toBe(true);

		if (Exit.isFailure(result)) {
			const failure = Option.getOrNull(Cause.failureOption(result.cause));
			expect(failure).toBe(
				"TaskRepository.getTask is not implemented yet (data dir: /tmp/tasks-test)",
			);
		}
	});
});
