import { describe, expect, it } from "bun:test";
import { NodeContext } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
	defaultDataDir,
	formatOutput,
	makeCli,
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
});
