import { describe, expect, it } from "bun:test";
import type { Task } from "./schema.js";
import { isBlocked, isUnblocked } from "./query.js";

const makeTask = (
	overrides: Partial<Task> & Pick<Task, "id" | "title">,
): Task => ({
	id: overrides.id,
	title: overrides.title,
	status: overrides.status ?? "active",
	area: overrides.area ?? "personal",
	project: overrides.project ?? null,
	tags: overrides.tags ?? [],
	created: overrides.created ?? "2026-02-25",
	updated: overrides.updated ?? "2026-02-25",
	urgency: overrides.urgency ?? "medium",
	energy: overrides.energy ?? "medium",
	due: overrides.due ?? null,
	context: overrides.context ?? "",
	subtasks: overrides.subtasks ?? [],
	blocked_by: overrides.blocked_by ?? [],
	estimated_minutes: overrides.estimated_minutes ?? null,
	actual_minutes: overrides.actual_minutes ?? null,
	completed_at: overrides.completed_at ?? null,
	last_surfaced: overrides.last_surfaced ?? null,
	defer_until: overrides.defer_until ?? null,
	nudge_count: overrides.nudge_count ?? 0,
	recurrence: overrides.recurrence ?? null,
	recurrence_trigger: overrides.recurrence_trigger ?? "clock",
	recurrence_strategy: overrides.recurrence_strategy ?? "replace",
	recurrence_last_generated: overrides.recurrence_last_generated ?? null,
});

describe("query dependency predicates", () => {
	it("isBlocked returns true when any blocker exists and is not done", () => {
		const blocker = makeTask({
			id: "setup-router",
			title: "Set up router",
			status: "active",
		});
		const task = makeTask({
			id: "wire-rack",
			title: "Wire rack",
			blocked_by: ["setup-router"],
		});

		expect(isBlocked(task, [task, blocker])).toBe(true);
		expect(isUnblocked(task, [task, blocker])).toBe(false);
	});

	it("isBlocked returns false when every blocker is done", () => {
		const blocker = makeTask({
			id: "setup-router",
			title: "Set up router",
			status: "done",
		});
		const task = makeTask({
			id: "wire-rack",
			title: "Wire rack",
			blocked_by: ["setup-router"],
		});

		expect(isBlocked(task, [task, blocker])).toBe(false);
		expect(isUnblocked(task, [task, blocker])).toBe(true);
	});

	it("isBlocked returns false for unknown blocker ids", () => {
		const task = makeTask({
			id: "wire-rack",
			title: "Wire rack",
			blocked_by: ["missing-task"],
		});

		expect(isBlocked(task, [task])).toBe(false);
		expect(isUnblocked(task, [task])).toBe(true);
	});
});
