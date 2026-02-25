import { describe, expect, it } from "bun:test";
import { NodeContext } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
	defaultDataDir,
	formatOutput,
	makeCli,
	resolveCreateTaskInput,
	resolveCreateWorkLogInput,
	resolveGlobalCliOptions,
	resolveListTaskFilters,
	resolveListWorkLogFilters,
	resolveUpdateTaskPatch,
	resolveUpdateWorkLogPatch,
	type GlobalCliOptions,
} from "./cli.js";

describe("cli global options", () => {
	it("defaultDataDir uses HOME when available", () => {
		expect(defaultDataDir({ HOME: "/home/simon" })).toBe(
			"/home/simon/.local/share/tasks",
		);
	});

	it("defaultDataDir falls back when HOME is missing", () => {
		expect(defaultDataDir({})).toBe(".local/share/tasks");
	});

	it("resolveGlobalCliOptions uses the explicit data directory", () => {
		const resolved = resolveGlobalCliOptions(
			{
				dataDir: Option.some("/tmp/tasks-data"),
				pretty: true,
			},
			{ HOME: "/home/simon" },
		);

		expect(resolved).toEqual({
			dataDir: "/tmp/tasks-data",
			pretty: true,
		});
	});

	it("resolveGlobalCliOptions uses default data directory when missing", () => {
		const resolved = resolveGlobalCliOptions(
			{
				dataDir: Option.none(),
				pretty: false,
			},
			{ HOME: "/home/simon" },
		);

		expect(resolved).toEqual({
			dataDir: "/home/simon/.local/share/tasks",
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
			project: Option.some("homelab"),
			tags: Option.some("hardware, weekend, ,ops"),
			due: Option.some("2026-03-01"),
			deferUntil: Option.some("2026-02-28"),
			urgency: Option.some("high"),
			energy: Option.some("high"),
			context: Option.some("Mini-ITX build"),
			recurrence: Option.some("FREQ=WEEKLY;BYDAY=MO"),
			recurrenceTrigger: Option.some("completion"),
			recurrenceStrategy: Option.some("accumulate"),
		});

		expect(input).toEqual({
			title: "Revive unzen server",
			status: "active",
			area: "infrastructure",
			project: "homelab",
			tags: ["hardware", "weekend", "ops"],
			due: "2026-03-01",
			defer_until: "2026-02-28",
			urgency: "high",
			energy: "high",
			context: "Mini-ITX build",
			recurrence: "FREQ=WEEKLY;BYDAY=MO",
			recurrence_trigger: "completion",
			recurrence_strategy: "accumulate",
		});
	});

	it("omits unset create options and empty tags", () => {
		const input = resolveCreateTaskInput({
			title: "Capture outage notes",
			status: Option.none(),
			area: Option.none(),
			project: Option.none(),
			tags: Option.some(" ,  , "),
			due: Option.none(),
			deferUntil: Option.none(),
			urgency: Option.none(),
			energy: Option.none(),
			context: Option.none(),
			recurrence: Option.none(),
			recurrenceTrigger: Option.none(),
			recurrenceStrategy: Option.none(),
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
			project: Option.some("homelab"),
			tags: Option.some("hardware, weekend, ,ops"),
			due: Option.some("2026-03-01"),
			deferUntil: Option.some("2026-02-28"),
			urgency: Option.some("high"),
			energy: Option.some("high"),
			context: Option.some("Mini-ITX build"),
			recurrence: Option.some("FREQ=WEEKLY;BYDAY=MO"),
			recurrenceTrigger: Option.some("completion"),
			recurrenceStrategy: Option.some("accumulate"),
		});

		expect(patch).toEqual({
			title: "Revive unzen server",
			status: "active",
			area: "infrastructure",
			project: "homelab",
			tags: ["hardware", "weekend", "ops"],
			due: "2026-03-01",
			defer_until: "2026-02-28",
			urgency: "high",
			energy: "high",
			context: "Mini-ITX build",
			recurrence: "FREQ=WEEKLY;BYDAY=MO",
			recurrence_trigger: "completion",
			recurrence_strategy: "accumulate",
		});
	});

	it("omits unset update options and empty tags", () => {
		const patch = resolveUpdateTaskPatch({
			title: Option.none(),
			status: Option.none(),
			area: Option.none(),
			project: Option.none(),
			tags: Option.some(" ,  , "),
			due: Option.none(),
			deferUntil: Option.none(),
			urgency: Option.none(),
			energy: Option.none(),
			context: Option.none(),
			recurrence: Option.none(),
			recurrenceTrigger: Option.none(),
			recurrenceStrategy: Option.none(),
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
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
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
				"revive-unzen",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
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
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					pretty: true,
				},
				input: {
					title: "Revive unzen server",
					status: "active",
					area: "infrastructure",
					project: "homelab",
					tags: ["hardware", "weekend", "ops"],
					due: "2026-03-01",
					defer_until: "2026-02-28",
					urgency: "high",
					energy: "high",
					context: "Mini-ITX build",
					recurrence: "FREQ=WEEKLY;BYDAY=MO",
					recurrence_trigger: "completion",
					recurrence_strategy: "accumulate",
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
				"revive-unzen",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					pretty: true,
				},
				id: "revive-unzen",
				patch: {
					title: "Revive unzen server",
					status: "active",
					area: "infrastructure",
					project: "homelab",
					tags: ["hardware", "weekend", "ops"],
					due: "2026-03-01",
					defer_until: "2026-02-28",
					urgency: "high",
					energy: "high",
					context: "Mini-ITX build",
					recurrence: "FREQ=WEEKLY;BYDAY=MO",
					recurrence_trigger: "completion",
					recurrence_strategy: "accumulate",
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
				"revive-unzen",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
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
				"revive-unzen",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
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
				"revive-unzen",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
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
				"quick-wins",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
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
				"revive-unzen-20260305T090000Z",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
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
				"revive-unzen-20260305T090000Z",
			]).pipe(Effect.provide(NodeContext.layer)),
		);

		expect(captured).toEqual([
			{
				options: {
					dataDir: "/tmp/tasks-data",
					pretty: true,
				},
				id: "revive-unzen-20260305T090000Z",
			},
		]);
	});
});
