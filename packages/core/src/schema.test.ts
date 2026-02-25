import { describe, expect, it } from "bun:test";
import * as Schema from "effect/Schema";
import {
	Task,
	TaskCreateInput,
	TaskPatch,
	WorkLogCreateInput,
	WorkLogEntry,
	WorkLogPatch,
} from "./schema.js";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

describe("schema", () => {
	it("round-trips Task through decode + encode", () => {
		const encodedTask: Schema.Schema.Encoded<typeof Task> = {
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
		};

		const decode = Schema.decodeUnknownSync(Task);
		const encode = Schema.encodeSync(Task);
		const decodedTask = decode(encodedTask);

		expect(encode(decodedTask)).toEqual(encodedTask);
	});

	it("round-trips TaskCreateInput and applies defaults", () => {
		const decode = Schema.decodeUnknownSync(TaskCreateInput) as (
			input: unknown,
		) => Schema.Schema.Type<typeof TaskCreateInput>;
		const encode = Schema.encodeSync(TaskCreateInput);
		const decodedInput = decode({ title: "Capture outage notes" });

		expect(decodedInput).toMatchObject({
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
		expect(decodedInput.created).toMatch(isoDatePattern);
		expect(decodedInput.updated).toMatch(isoDatePattern);

		expect(decode(encode(decodedInput))).toEqual(decodedInput);
	});

	it("round-trips TaskPatch through decode + encode", () => {
		const encodedPatch: Schema.Schema.Encoded<typeof TaskPatch> = {
			title: "Repair array",
			project: "homelab",
			tags: ["hardware"],
			nudge_count: 3,
			recurrence: null,
			recurrence_trigger: "completion",
		};

		const decode = Schema.decodeUnknownSync(TaskPatch);
		const encode = Schema.encodeSync(TaskPatch);
		const decodedPatch = decode(encodedPatch);

		expect(encode(decodedPatch)).toEqual(encodedPatch);
	});

	it("round-trips WorkLogEntry through decode + encode", () => {
		const encodedEntry: Schema.Schema.Encoded<typeof WorkLogEntry> = {
			id: "revive-unzen-20260220T0900",
			task_id: "revive-unzen",
			started_at: "2026-02-20T09:00:00Z",
			ended_at: "2026-02-20T10:30:00Z",
			date: "2026-02-20",
		};

		const decode = Schema.decodeUnknownSync(WorkLogEntry);
		const encode = Schema.encodeSync(WorkLogEntry);
		const decodedEntry = decode(encodedEntry);

		expect(encode(decodedEntry)).toEqual(encodedEntry);
	});

	it("round-trips WorkLogCreateInput and applies defaults", () => {
		const decode = Schema.decodeUnknownSync(WorkLogCreateInput) as (
			input: unknown,
		) => Schema.Schema.Type<typeof WorkLogCreateInput>;
		const encode = Schema.encodeSync(WorkLogCreateInput);
		const decodedInput = decode({
			task_id: "revive-unzen",
			started_at: "2026-02-20T09:00:00Z",
		});

		expect(decodedInput).toEqual({
			task_id: "revive-unzen",
			started_at: "2026-02-20T09:00:00Z",
			ended_at: null,
		});
		expect(decode(encode(decodedInput))).toEqual(decodedInput);
	});

	it("round-trips WorkLogPatch through decode + encode", () => {
		const encodedPatch: Schema.Schema.Encoded<typeof WorkLogPatch> = {
			task_id: "revive-unzen",
			ended_at: "2026-02-20T10:30:00Z",
		};

		const decode = Schema.decodeUnknownSync(WorkLogPatch);
		const encode = Schema.encodeSync(WorkLogPatch);
		const decodedPatch = decode(encodedPatch);

		expect(encode(decodedPatch)).toEqual(encodedPatch);
	});
});
