import { describe, expect, it } from "bun:test";
import type { Task, WorkLogEntry } from "./schema.js";
import {
	applyTaskPatch,
	applyWorkLogPatch,
	createTaskFromInput,
	generateTaskId,
	parseTaskRecord,
	parseWorkLogRecord,
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
