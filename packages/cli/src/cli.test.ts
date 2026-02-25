import { describe, expect, it } from "bun:test";
import { NodeContext } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
	defaultDataDir,
	formatOutput,
	makeCli,
	resolveListTaskFilters,
	resolveGlobalCliOptions,
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
});
