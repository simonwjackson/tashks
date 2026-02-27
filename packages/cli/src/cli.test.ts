import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
	cli,
	defaultDataDir,
	formatOutput,
	makeCli,
	resolveCreateTaskInput,
	resolveCreateWorkLogInput,
	resolveCreateProjectInput,
	resolveGlobalCliOptions,
	resolveListTaskFilters,
	resolveListWorkLogFilters,
	resolveListProjectFilters,
	resolveUpdateTaskPatch,
	resolveUpdateWorkLogPatch,
	resolveUpdateProjectPatch,
	type GlobalCliOptions,
} from "./cli.js";

const captureStdout = async <A>(
	run: () => Promise<A>,
): Promise<{ readonly result: A; readonly stdout: string }> => {
	const chunks: Array<string> = [];
	const originalWrite = process.stdout.write;

	process.stdout.write = ((chunk: string | Uint8Array) => {
		chunks.push(
			typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
		);
		return true;
	}) as typeof process.stdout.write;

	try {
		const result = await run();
		return { result, stdout: chunks.join("") };
	} finally {
		process.stdout.write = originalWrite;
	}
};

const runDefaultCliJson = async (
	argv: ReadonlyArray<string>,
): Promise<unknown> => {
	const { stdout } = await captureStdout(() =>
		Effect.runPromise(
			cli(["bun", "cli.ts", ...argv]).pipe(Effect.provide(NodeContext.layer)),
		),
	);

	return JSON.parse(stdout.trim());
};

describe("cli global options", () => {
	it("defaultDataDir uses HOME when available", () => {
		expect(defaultDataDir({ HOME: "/home/simon" })).toBe(
			"/home/simon/.local/share/tashks",
		);
	});

	it("defaultDataDir falls back when HOME is missing", () => {
		expect(defaultDataDir({})).toBe(".local/share/tashks");
	});

	it("resolveGlobalCliOptions uses the explicit data directory", () => {
		const resolved = resolveGlobalCliOptions(
			{
				dataDir: Option.some("/tmp/tasks-data"),
				tasksFile: Option.none(),
				worklogFile: Option.none(),
				pretty: true,
			},
			{ HOME: "/home/simon" },
		);

		expect(resolved).toEqual({
			dataDir: "/tmp/tasks-data",
			tasksFile: "/tmp/tasks-data/tasks.yaml",
			worklogFile: "/tmp/tasks-data/work-log.yaml",
			pretty: true,
		});
	});

	it("resolveGlobalCliOptions uses default data directory when missing", () => {
		const resolved = resolveGlobalCliOptions(
			{
				dataDir: Option.none(),
				tasksFile: Option.none(),
				worklogFile: Option.none(),
				pretty: false,
			},
			{ HOME: "/home/simon" },
		);

		expect(resolved).toEqual({
			dataDir: "/home/simon/.local/share/tashks",
			tasksFile: "/home/simon/.local/share/tashks/tasks.yaml",
			worklogFile: "/home/simon/.local/share/tashks/work-log.yaml",
			pretty: false,
		});
	});
});

describe("cli output formatting", () => {
	it("emits compact JSON when pretty is false", () => {
		expect(formatOutput({ id: "revive-unzen", done: false }, false)).toBe(
			'{"id":"revive-unzen","done":false}',
		);
	});

	it("emits indented JSON when pretty is true", () => {
		expect(formatOutput({ id: "revive-unzen", done: false }, true)).toBe(
			'{\n  "id": "revive-unzen",\n  "done": false\n}',
		);
	});
});

describe("list filter resolution", () => {
	it("maps all list options to repository filter fields", () => {
		const filters = resolveListTaskFilters({
			status: Option.some("active"),
			area: Option.some("work"),
			project: Option.some("homelab"),
			tags: Option.some("hardware, weekend, ,ops"),
			dueBefore: Option.some("2026-03-07"),
			dueAfter: Option.some("2026-03-03"),
			unblockedOnly: true,
			date: Option.some("2026-03-05"),
			durationMin: Option.some(15),
			durationMax: Option.some(60),
			context: Option.some("@home"),
			staleDays: Option.some(7),
		});

		expect(filters).toEqual({
			status: "active",
			area: "work",
			project: "homelab",
			tags: ["hardware", "weekend", "ops"],
			due_before: "2026-03-07",
			due_after: "2026-03-03",
			unblocked_only: true,
			date: "2026-03-05",
			duration_min: 15,
			duration_max: 60,
			context: "@home",
			stale_days: 7,
		});
	});

	it("omits unset filters and empty tag lists", () => {
		const filters = resolveListTaskFilters({
			status: Option.none(),
			area: Option.none(),
			project: Option.none(),
			tags: Option.some(" ,  , "),
			dueBefore: Option.none(),
			dueAfter: Option.none(),
			unblockedOnly: false,
			date: Option.none(),
			durationMin: Option.none(),
			durationMax: Option.none(),
			context: Option.none(),
			staleDays: Option.none(),
		});

		expect(filters).toEqual({});
	});
});

describe("create input resolution", () => {
	it("maps all create options to repository create input fields", () => {
		const input = resolveCreateTaskInput({
			title: "Revive unzen server",
			status: Option.some("active"),
			area: Option.some("infrastructure"),
			project: ["homelab"],
			tags: Option.some("hardware, weekend, ,ops"),
			due: Option.some("2026-03-01"),
			deferUntil: Option.some("2026-02-28"),
			urgency: Option.some("high"),
			energy: Option.some("high"),
			context: Option.some("Mini-ITX build"),
			recurrence: Option.some("FREQ=WEEKLY;BYDAY=MO"),
			recurrenceTrigger: Option.some("completion"),
			recurrenceStrategy: Option.some("accumulate"),
			duration: Option.some(120),
			related: Option.some("task-1,task-2"),
			blockedBy: Option.some("blocker-1,blocker-2"),
			subtasks: Option.some("Buy milk,Call vet"),
		});

		expect(input).toEqual({
			title: "Revive unzen server",
			status: "active",
			area: "infrastructure",
			projects: ["homelab"],
			tags: ["hardware", "weekend", "ops"],
			due: "2026-03-01",
			defer_until: "2026-02-28",
			urgency: "high",
			energy: "high",
			context: "Mini-ITX build",
			recurrence: "FREQ=WEEKLY;BYDAY=MO",
			recurrence_trigger: "completion",
			recurrence_strategy: "accumulate",
			estimated_minutes: 120,
			related: ["task-1", "task-2"],
			blocked_by: ["blocker-1", "blocker-2"],
			subtasks: [
				{ text: "Buy milk", done: false },
				{ text: "Call vet", done: false },
			],
		});
	});

	it("omits unset create options and empty tags", () => {
		const input = resolveCreateTaskInput({
			title: "Capture outage notes",
			status: Option.none(),
			area: Option.none(),
			project: [],
			tags: Option.some(" ,  , "),
			due: Option.none(),
			deferUntil: Option.none(),
			urgency: Option.none(),
			energy: Option.none(),
			context: Option.none(),
			recurrence: Option.none(),
			recurrenceTrigger: Option.none(),
			recurrenceStrategy: Option.none(),
			duration: Option.none(),
			related: Option.none(),
			blockedBy: Option.none(),
			subtasks: Option.none(),
		});

		expect(input).toEqual({
			title: "Capture outage notes",
		});
	});
});

describe("update patch resolution", () => {
	it("maps all update options to repository patch fields", () => {
		const patch = resolveUpdateTaskPatch({
			title: Option.some("Revive unzen server"),
			status: Option.some("active"),
			area: Option.some("infrastructure"),
			project: ["homelab"],
			tags: Option.some("hardware, weekend, ,ops"),
			due: Option.some("2026-03-01"),
			deferUntil: Option.some("2026-02-28"),
			urgency: Option.some("high"),
			energy: Option.some("high"),
			context: Option.some("Mini-ITX build"),
			recurrence: Option.some("FREQ=WEEKLY;BYDAY=MO"),
			recurrenceTrigger: Option.some("completion"),
			recurrenceStrategy: Option.some("accumulate"),
			duration: Option.some(90),
			related: Option.some("task-a,task-b"),
			blockedBy: Option.some("dep-1,dep-2"),
		});

		expect(patch).toEqual({
			title: "Revive unzen server",
			status: "active",
			area: "infrastructure",
			projects: ["homelab"],
			tags: ["hardware", "weekend", "ops"],
			due: "2026-03-01",
			defer_until: "2026-02-28",
			urgency: "high",
			energy: "high",
			context: "Mini-ITX build",
			recurrence: "FREQ=WEEKLY;BYDAY=MO",
			recurrence_trigger: "completion",
			recurrence_strategy: "accumulate",
			estimated_minutes: 90,
			related: ["task-a", "task-b"],
			blocked_by: ["dep-1", "dep-2"],
		});
	});

	it("omits unset update options and empty tags", () => {
		const patch = resolveUpdateTaskPatch({
			title: Option.none(),
			status: Option.none(),
			area: Option.none(),
			project: [],
			tags: Option.some(" ,  , "),
			due: Option.none(),
			deferUntil: Option.none(),
			urgency: Option.none(),
			energy: Option.none(),
			context: Option.none(),
			recurrence: Option.none(),
			recurrenceTrigger: Option.none(),
			recurrenceStrategy: Option.none(),
			duration: Option.none(),
			related: Option.none(),
			blockedBy: Option.none(),
		});

		expect(patch).toEqual({});
	});
});

describe("worklog filter resolution", () => {
	it("maps list options to worklog repository filters", () => {
		const filters = resolveListWorkLogFilters({
			date: Option.some("2026-03-05"),
		});

		expect(filters).toEqual({
			date: "2026-03-05",
		});
	});

	it("omits unset worklog list filters", () => {
		const filters = resolveListWorkLogFilters({
			date: Option.none(),
		});

		expect(filters).toEqual({});
	});
});

describe("worklog create input resolution", () => {
	it("maps create options to repository create input fields", () => {
		const input = resolveCreateWorkLogInput({
			taskId: "revive-unzen",
			startedAt: "2026-03-05T09:00:00Z",
			endedAt: Option.some("2026-03-05T10:15:00Z"),
		});

		expect(input).toEqual({
			task_id: "revive-unzen",
			started_at: "2026-03-05T09:00:00Z",
			ended_at: "2026-03-05T10:15:00Z",
		});
	});

	it("omits ended_at when not provided", () => {
		const input = resolveCreateWorkLogInput({
			taskId: "revive-unzen",
			startedAt: "2026-03-05T09:00:00Z",
			endedAt: Option.none(),
		});

		expect(input).toEqual({
			task_id: "revive-unzen",
			started_at: "2026-03-05T09:00:00Z",
		});
	});
});

describe("worklog update patch resolution", () => {
	it("maps update options to repository patch fields", () => {
		const patch = resolveUpdateWorkLogPatch({
			taskId: Option.some("revive-unzen"),
			startedAt: Option.some("2026-03-05T09:00:00Z"),
			endedAt: Option.some("2026-03-05T10:15:00Z"),
		});

		expect(patch).toEqual({
			task_id: "revive-unzen",
			started_at: "2026-03-05T09:00:00Z",
			ended_at: "2026-03-05T10:15:00Z",
		});
	});

	it("omits unset worklog patch fields", () => {
		const patch = resolveUpdateWorkLogPatch({
			taskId: Option.none(),
			startedAt: Option.none(),
			endedAt: Option.none(),
		});

		expect(patch).toEqual({});
	});
});

describe("cli parsing", () => {
	it("parses --data-dir and --pretty as global options", async () => {
		const captured: Array<GlobalCliOptions> = [];
		const program = makeCli((options) =>
			Effect.sync(() => {
				captured.push(options);
			}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				dataDir: "/tmp/tasks-data",
				tasksFile: "/tmp/tasks-data/tasks.yaml",
				worklogFile: "/tmp/tasks-data/work-log.yaml",
				pretty: true,
			},
		]);
	});

	it("parses `tasks list` with all list filter flags", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly filters: ReturnType<typeof resolveListTaskFilters>;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(options, filters) =>
				Effect.sync(() => {
					captured.push({ options, filters });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"list",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--status",
				"active",
				"--area",
				"work",
				"--project",
				"homelab",
				"--tags",
				"hardware, weekend,ops",
				"--due-before",
				"2026-03-07",
				"--due-after",
				"2026-03-03",
				"--unblocked-only",
				"--date",
				"2026-03-05",
				"--duration-min",
				"15",
				"--duration-max",
				"120",
				"--context",
				"@home",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				filters: {
					status: "active",
					area: "work",
					project: "homelab",
					tags: ["hardware", "weekend", "ops"],
					due_before: "2026-03-07",
					due_after: "2026-03-03",
					unblocked_only: true,
					date: "2026-03-05",
					duration_min: 15,
					duration_max: 120,
					context: "@home",
				},
			},
		]);
	});

	it("parses `tasks get <id>` with global options", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly id: string;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(options, id) =>
				Effect.sync(() => {
					captured.push({ options, id });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"get",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--id",
				"revive-unzen",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				id: "revive-unzen",
			},
		]);
	});

	it("parses `tasks create` with all create flags", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly input: ReturnType<typeof resolveCreateTaskInput>;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(options, input) =>
				Effect.sync(() => {
					captured.push({ options, input });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"create",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--title",
				"Revive unzen server",
				"--status",
				"active",
				"--area",
				"infrastructure",
				"--project",
				"homelab",
				"--tags",
				"hardware, weekend,ops",
				"--due",
				"2026-03-01",
				"--defer-until",
				"2026-02-28",
				"--urgency",
				"high",
				"--energy",
				"high",
				"--context",
				"Mini-ITX build",
				"--recurrence",
				"FREQ=WEEKLY;BYDAY=MO",
				"--recurrence-trigger",
				"completion",
				"--recurrence-strategy",
				"accumulate",
				"--duration",
				"120",
				"--related",
				"task-a,task-b",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				input: {
					title: "Revive unzen server",
					status: "active",
					area: "infrastructure",
					projects: ["homelab"],
					tags: ["hardware", "weekend", "ops"],
					due: "2026-03-01",
					defer_until: "2026-02-28",
					urgency: "high",
					energy: "high",
					context: "Mini-ITX build",
					recurrence: "FREQ=WEEKLY;BYDAY=MO",
					recurrence_trigger: "completion",
					recurrence_strategy: "accumulate",
					estimated_minutes: 120,
					related: ["task-a", "task-b"],
				},
			},
		]);
	});

	it("parses `tasks update <id>` with all patch flags", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly id: string;
			readonly patch: ReturnType<typeof resolveUpdateTaskPatch>;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(options, id, patch) =>
				Effect.sync(() => {
					captured.push({ options, id, patch });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"update",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--title",
				"Revive unzen server",
				"--status",
				"active",
				"--area",
				"infrastructure",
				"--project",
				"homelab",
				"--tags",
				"hardware, weekend,ops",
				"--due",
				"2026-03-01",
				"--defer-until",
				"2026-02-28",
				"--urgency",
				"high",
				"--energy",
				"high",
				"--context",
				"Mini-ITX build",
				"--recurrence",
				"FREQ=WEEKLY;BYDAY=MO",
				"--recurrence-trigger",
				"completion",
				"--recurrence-strategy",
				"accumulate",
				"--duration",
				"90",
				"--related",
				"task-a,task-b",
				"--id",
				"revive-unzen",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				id: "revive-unzen",
				patch: {
					title: "Revive unzen server",
					status: "active",
					area: "infrastructure",
					projects: ["homelab"],
					tags: ["hardware", "weekend", "ops"],
					due: "2026-03-01",
					defer_until: "2026-02-28",
					urgency: "high",
					energy: "high",
					context: "Mini-ITX build",
					recurrence: "FREQ=WEEKLY;BYDAY=MO",
					recurrence_trigger: "completion",
					recurrence_strategy: "accumulate",
					estimated_minutes: 90,
					related: ["task-a", "task-b"],
				},
			},
		]);
	});

	it("parses `tasks delete <id>` with global options", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly id: string;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(options, id) =>
				Effect.sync(() => {
					captured.push({ options, id });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"delete",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--id",
				"revive-unzen",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				id: "revive-unzen",
			},
		]);
	});

	it("parses `tasks highlight <id>` with global options", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly id: string;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(options, id) =>
				Effect.sync(() => {
					captured.push({ options, id });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"highlight",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--id",
				"revive-unzen",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				id: "revive-unzen",
			},
		]);
	});

	it("parses `tasks complete <id>` with global options", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly id: string;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(options, id) =>
				Effect.sync(() => {
					captured.push({ options, id });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"complete",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--id",
				"revive-unzen",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				id: "revive-unzen",
			},
		]);
	});

	it("parses `tasks recurrence-check` with global options", async () => {
		const captured: Array<GlobalCliOptions> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(options) =>
				Effect.sync(() => {
					captured.push(options);
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"recurrence-check",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				dataDir: "/tmp/tasks-data",
				tasksFile: "/tmp/tasks-data/tasks.yaml",
				worklogFile: "/tmp/tasks-data/work-log.yaml",
				pretty: true,
			},
		]);
	});

	it("parses `tasks perspective <name>` with global options", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly name: string;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(options, name) =>
				Effect.sync(() => {
					captured.push({ options, name });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"perspective",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--name",
				"quick-wins",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				name: "quick-wins",
			},
		]);
	});

	it("parses `tasks perspectives` with global options", async () => {
		const captured: Array<GlobalCliOptions> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(options) =>
				Effect.sync(() => {
					captured.push(options);
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"perspectives",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				dataDir: "/tmp/tasks-data",
				tasksFile: "/tmp/tasks-data/tasks.yaml",
				worklogFile: "/tmp/tasks-data/work-log.yaml",
				pretty: true,
			},
		]);
	});

	it("parses `tasks worklog list` with filters", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly filters: ReturnType<typeof resolveListWorkLogFilters>;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(_options) => Effect.void,
			(_options) => Effect.void,
			(options, filters) =>
				Effect.sync(() => {
					captured.push({ options, filters });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"worklog",
				"list",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--date",
				"2026-03-05",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				filters: {
					date: "2026-03-05",
				},
			},
		]);
	});

	it("parses `tasks worklog create` with all flags", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly input: ReturnType<typeof resolveCreateWorkLogInput>;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(_options) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(options, input) =>
				Effect.sync(() => {
					captured.push({ options, input });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"worklog",
				"create",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--task-id",
				"revive-unzen",
				"--started-at",
				"2026-03-05T09:00:00Z",
				"--ended-at",
				"2026-03-05T10:15:00Z",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				input: {
					task_id: "revive-unzen",
					started_at: "2026-03-05T09:00:00Z",
					ended_at: "2026-03-05T10:15:00Z",
				},
			},
		]);
	});

	it("parses `tasks worklog update <id>` with patch flags", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly id: string;
			readonly patch: ReturnType<typeof resolveUpdateWorkLogPatch>;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(_options) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _input) => Effect.void,
			(options, id, patch) =>
				Effect.sync(() => {
					captured.push({ options, id, patch });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"worklog",
				"update",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--task-id",
				"revive-unzen",
				"--started-at",
				"2026-03-05T09:00:00Z",
				"--ended-at",
				"2026-03-05T10:15:00Z",
				"--id",
				"revive-unzen-20260305T090000Z",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				id: "revive-unzen-20260305T090000Z",
				patch: {
					task_id: "revive-unzen",
					started_at: "2026-03-05T09:00:00Z",
					ended_at: "2026-03-05T10:15:00Z",
				},
			},
		]);
	});

	it("parses `tasks worklog delete <id>` with global options", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly id: string;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(_options) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(options, id) =>
				Effect.sync(() => {
					captured.push({ options, id });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"worklog",
				"delete",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--id",
				"revive-unzen-20260305T090000Z",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: true,
				},
				id: "revive-unzen-20260305T090000Z",
			},
		]);
	});
});

describe("cli smoke", () => {
	it("round-trips create/get/list/update/delete against a real data directory", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-cli-smoke-"));

		try {
			const created = (await runDefaultCliJson([
				"create",
				"--data-dir",
				dataDir,
				"--title",
				"Revive unzen server",
				"--area",
				"infrastructure",
				"--project",
				"homelab",
				"--tags",
				"hardware,weekend",
			])) as Record<string, unknown>;

			expect(created.title).toBe("Revive unzen server");
			expect(created.area).toBe("infrastructure");
			expect(created.projects).toEqual(["homelab"]);
			expect(created.tags).toEqual(["hardware", "weekend"]);
			expect(created.status).toBe("active");
			expect(created.id).toMatch(/^revive-unzen-server-[a-z0-9]{6}$/);

			const id = created.id as string;

			const fetched = (await runDefaultCliJson([
				"get",
				"--data-dir",
				dataDir,
				"--id",
				id,
			])) as Record<string, unknown>;

			expect(fetched.id).toBe(id);
			expect(fetched.title).toBe("Revive unzen server");

			const listedBeforeUpdate = (await runDefaultCliJson([
				"list",
				"--data-dir",
				dataDir,
			])) as Array<Record<string, unknown>>;

			expect(listedBeforeUpdate).toHaveLength(1);
			expect(listedBeforeUpdate[0]?.id).toBe(id);

			const updated = (await runDefaultCliJson([
				"update",
				"--data-dir",
				dataDir,
				"--status",
				"backlog",
				"--project",
				"lab-refresh",
				"--tags",
				"hardware,rack",
				"--context",
				"Start with rack shelf and power checks",
				"--id",
				id,
			])) as Record<string, unknown>;

			expect(updated.id).toBe(id);
			expect(updated.status).toBe("backlog");
			expect(updated.projects).toEqual(["lab-refresh"]);
			expect(updated.tags).toEqual(["hardware", "rack"]);
			expect(updated.context).toBe("Start with rack shelf and power checks");

			const deleted = (await runDefaultCliJson([
				"delete",
				"--data-dir",
				dataDir,
				"--id",
				id,
			])) as Record<string, unknown>;

			expect(deleted).toEqual({ deleted: true });

			const listedAfterDelete = (await runDefaultCliJson([
				"list",
				"--data-dir",
				dataDir,
			])) as Array<unknown>;

			expect(listedAfterDelete).toEqual([]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});

describe("project filter resolution", () => {
	it("maps all project list options to filter fields", () => {
		const filters = resolveListProjectFilters({
			status: Option.some("active"),
			area: Option.some("infrastructure"),
		});

		expect(filters).toEqual({
			status: "active",
			area: "infrastructure",
		});
	});

	it("omits unset project list filters", () => {
		const filters = resolveListProjectFilters({
			status: Option.none(),
			area: Option.none(),
		});

		expect(filters).toEqual({});
	});
});

describe("project create input resolution", () => {
	it("maps all create options to project create input fields", () => {
		const input = resolveCreateProjectInput({
			title: "Homelab Refresh",
			status: Option.some("on-hold"),
			area: Option.some("infrastructure"),
			description: Option.some("Refresh the homelab"),
			tags: Option.some("hardware, networking"),
		});

		expect(input).toEqual({
			title: "Homelab Refresh",
			status: "on-hold",
			area: "infrastructure",
			description: "Refresh the homelab",
			tags: ["hardware", "networking"],
		});
	});

	it("omits unset create options and empty tags", () => {
		const input = resolveCreateProjectInput({
			title: "Minimal Project",
			status: Option.none(),
			area: Option.none(),
			description: Option.none(),
			tags: Option.some(" , , "),
		});

		expect(input).toEqual({
			title: "Minimal Project",
		});
	});
});

describe("project update patch resolution", () => {
	it("maps all update options to project patch fields", () => {
		const patch = resolveUpdateProjectPatch({
			title: Option.some("Updated Title"),
			status: Option.some("done"),
			area: Option.some("work"),
			description: Option.some("Updated desc"),
			tags: Option.some("tag1, tag2"),
		});

		expect(patch).toEqual({
			title: "Updated Title",
			status: "done",
			area: "work",
			description: "Updated desc",
			tags: ["tag1", "tag2"],
		});
	});

	it("omits unset update options and empty tags", () => {
		const patch = resolveUpdateProjectPatch({
			title: Option.none(),
			status: Option.none(),
			area: Option.none(),
			description: Option.none(),
			tags: Option.some(" , , "),
		});

		expect(patch).toEqual({});
	});
});

describe("project cli parsing", () => {
	it("parses `project list` with filter flags", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly filters: ReturnType<typeof resolveListProjectFilters>;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(_options) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _fromDir) => Effect.void,
			(_options) => Effect.void,
			(options, filters) =>
				Effect.sync(() => {
					captured.push({ options, filters });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"project",
				"list",
				"--data-dir",
				"/tmp/tasks-data",
				"--status",
				"active",
				"--area",
				"infrastructure",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: false,
				},
				filters: {
					status: "active",
					area: "infrastructure",
				},
			},
		]);
	});

	it("parses `project get --id ID`", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly id: string;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(_options) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _fromDir) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(options, id) =>
				Effect.sync(() => {
					captured.push({ options, id });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"project",
				"get",
				"--data-dir",
				"/tmp/tasks-data",
				"--id",
				"homelab-refresh",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: false,
				},
				id: "homelab-refresh",
			},
		]);
	});

	it("parses `project create --title ...`", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly input: ReturnType<typeof resolveCreateProjectInput>;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(_options) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _fromDir) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(options, input) =>
				Effect.sync(() => {
					captured.push({ options, input });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"project",
				"create",
				"--data-dir",
				"/tmp/tasks-data",
				"--title",
				"Homelab Refresh",
				"--status",
				"active",
				"--area",
				"infrastructure",
				"--description",
				"Refresh the homelab",
				"--tags",
				"hardware,networking",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: false,
				},
				input: {
					title: "Homelab Refresh",
					status: "active",
					area: "infrastructure",
					description: "Refresh the homelab",
					tags: ["hardware", "networking"],
				},
			},
		]);
	});

	it("parses `project update --id ID` with patch flags", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly id: string;
			readonly patch: ReturnType<typeof resolveUpdateProjectPatch>;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(_options) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _fromDir) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(options, id, patch) =>
				Effect.sync(() => {
					captured.push({ options, id, patch });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"project",
				"update",
				"--data-dir",
				"/tmp/tasks-data",
				"--id",
				"homelab-refresh",
				"--status",
				"on-hold",
				"--title",
				"Updated Title",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: false,
				},
				id: "homelab-refresh",
				patch: {
					status: "on-hold",
					title: "Updated Title",
				},
			},
		]);
	});

	it("parses `project delete --id ID`", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly id: string;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(_options) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _fromDir) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(options, id) =>
				Effect.sync(() => {
					captured.push({ options, id });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"project",
				"delete",
				"--data-dir",
				"/tmp/tasks-data",
				"--id",
				"homelab-refresh",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: false,
				},
				id: "homelab-refresh",
			},
		]);
	});

	it("parses `project tasks --id ID`", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly id: string;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(_options) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _fromDir) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(options, id) =>
				Effect.sync(() => {
					captured.push({ options, id });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"project",
				"tasks",
				"--data-dir",
				"/tmp/tasks-data",
				"--id",
				"homelab-refresh",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: false,
				},
				id: "homelab-refresh",
			},
		]);
	});

	it("parses `project summary` with filter flags", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly filters: ReturnType<typeof resolveListProjectFilters>;
		}> = [];
		const program = makeCli(
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(_options) => Effect.void,
			(_options, _name) => Effect.void,
			(_options) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _fromDir) => Effect.void,
			(_options) => Effect.void,
			(_options, _filters) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _input) => Effect.void,
			(_options, _id, _patch) => Effect.void,
			(_options, _id) => Effect.void,
			(_options, _id) => Effect.void,
			(options, filters) =>
				Effect.sync(() => {
					captured.push({ options, filters });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"project",
				"summary",
				"--data-dir",
				"/tmp/tasks-data",
				"--status",
				"active",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					tasksFile: "/tmp/tasks-data/tasks.yaml",
					worklogFile: "/tmp/tasks-data/work-log.yaml",
					pretty: false,
				},
				filters: {
					status: "active",
				},
			},
		]);
	});
});

describe("project cli smoke", () => {
	it("round-trips project create/get/list/update/delete", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-project-cli-smoke-"));

		try {
			const created = (await runDefaultCliJson([
				"project",
				"create",
				"--data-dir",
				dataDir,
				"--title",
				"Homelab Refresh",
				"--area",
				"infrastructure",
				"--tags",
				"hardware,networking",
				"--description",
				"Refresh the homelab infrastructure",
			])) as Record<string, unknown>;

			expect(created.title).toBe("Homelab Refresh");
			expect(created.area).toBe("infrastructure");
			expect(created.status).toBe("active");
			expect(created.tags).toEqual(["hardware", "networking"]);
			expect(created.description).toBe("Refresh the homelab infrastructure");
			expect(created.id).toMatch(/^homelab-refresh-[a-z0-9]{6}$/);

			const id = created.id as string;

			const fetched = (await runDefaultCliJson([
				"project",
				"get",
				"--data-dir",
				dataDir,
				"--id",
				id,
			])) as Record<string, unknown>;

			expect(fetched.id).toBe(id);
			expect(fetched.title).toBe("Homelab Refresh");

			const listed = (await runDefaultCliJson([
				"project",
				"list",
				"--data-dir",
				dataDir,
			])) as Array<Record<string, unknown>>;

			expect(listed).toHaveLength(1);
			expect(listed[0]?.id).toBe(id);

			const updated = (await runDefaultCliJson([
				"project",
				"update",
				"--data-dir",
				dataDir,
				"--id",
				id,
				"--status",
				"on-hold",
				"--description",
				"Paused for now",
			])) as Record<string, unknown>;

			expect(updated.id).toBe(id);
			expect(updated.status).toBe("on-hold");
			expect(updated.description).toBe("Paused for now");

			const deleted = (await runDefaultCliJson([
				"project",
				"delete",
				"--data-dir",
				dataDir,
				"--id",
				id,
			])) as Record<string, unknown>;

			expect(deleted).toEqual({ deleted: true });

			const listedAfterDelete = (await runDefaultCliJson([
				"project",
				"list",
				"--data-dir",
				dataDir,
			])) as Array<unknown>;

			expect(listedAfterDelete).toEqual([]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});

describe("template cli parsing", () => {
	const noop = () => Effect.void;

	it("parses `tashks template create` with flags", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly input: unknown;
		}> = [];
		const program = makeCli(
			noop, // execute
			noop, // list
			noop, // get
			noop, // create
			noop, // update
			noop, // delete
			noop, // highlight
			noop, // complete
			noop, // recurrenceCheck
			noop, // perspective
			noop, // perspectives
			noop, // workLog
			noop, // workLogList
			noop, // workLogCreate
			noop, // workLogUpdate
			noop, // workLogDelete
			noop, // migrate
			noop, // project
			noop, // projectList
			noop, // projectGet
			noop, // projectCreate
			noop, // projectUpdate
			noop, // projectDelete
			noop, // projectTasks
			noop, // projectSummary
			noop, // promote
			noop, // areas
			noop, // contexts
			noop, // template
			noop, // templateList
			(options, input) =>
				Effect.sync(() => {
					captured.push({ options, input });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"template",
				"create",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--title",
				"Weekly Prep",
				"--tags",
				"prep,weekly",
				"--duration",
				"30",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.options.dataDir).toBe("/tmp/tasks-data");
		expect(captured[0]?.input).toMatchObject({
			title: "Weekly Prep",
			tags: ["prep", "weekly"],
			estimated_minutes: 30,
			is_template: true,
		});
	});

	it("parses `tashks template instantiate` with overrides", async () => {
		const captured: Array<{
			readonly options: GlobalCliOptions;
			readonly templateId: string;
			readonly overrides: Record<string, unknown>;
		}> = [];
		const program = makeCli(
			noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
			noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
			noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
			noop, // templateCreate
			(options, templateId, overrides) =>
				Effect.sync(() => {
					captured.push({ options, templateId, overrides });
				}),
		);

		await Effect.runPromise(
			program([
				"bun",
				"cli.ts",
				"template",
				"instantiate",
				"--data-dir",
				"/tmp/tasks-data",
				"--pretty",
				"--id",
				"weekly-prep",
				"--title",
				"This Week",
				"--due",
				"2026-03-01",
				"--defer-until",
				"2026-02-28",
				"--status",
				"active",
				"--project",
				"ops",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.templateId).toBe("weekly-prep");
		expect(captured[0]?.overrides).toEqual({
			title: "This Week",
			due: "2026-03-01",
			defer_until: "2026-02-28",
			status: "active",
			projects: ["ops"],
		});
	});
});
