import { describe, expect, it } from "bun:test";
import type { Task } from "./schema.js";
import {
	isBlocked,
	isDeferred,
	isDueBefore,
	isDueThisWeek,
	isUnblocked,
} from "./query.js";

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

describe("query date predicates", () => {
	it("isDueBefore matches tasks with due dates on or before the cutoff", () => {
		const cutoff = "2026-03-01";
		const dueBefore = makeTask({
			id: "renew-domain",
			title: "Renew domain",
			due: "2026-02-28",
		});
		const dueOnCutoff = makeTask({
			id: "pay-rent",
			title: "Pay rent",
			due: "2026-03-01",
		});
		const dueAfter = makeTask({
			id: "replace-battery",
			title: "Replace battery",
			due: "2026-03-02",
		});
		const noDue = makeTask({
			id: "cleanup-notes",
			title: "Cleanup notes",
			due: null,
		});

		expect(isDueBefore(cutoff)(dueBefore)).toBe(true);
		expect(isDueBefore(cutoff)(dueOnCutoff)).toBe(true);
		expect(isDueBefore(cutoff)(dueAfter)).toBe(false);
		expect(isDueBefore(cutoff)(noDue)).toBe(false);
	});

	it("isDueThisWeek matches due dates from today through the next 6 days", () => {
		const today = "2026-02-25";
		const dueToday = makeTask({
			id: "inbox-zero",
			title: "Inbox zero",
			due: "2026-02-25",
		});
		const dueInWeek = makeTask({
			id: "book-flights",
			title: "Book flights",
			due: "2026-03-03",
		});
		const duePast = makeTask({
			id: "file-receipts",
			title: "File receipts",
			due: "2026-02-24",
		});
		const dueBeyondWindow = makeTask({
			id: "plan-trip",
			title: "Plan trip",
			due: "2026-03-04",
		});
		const noDue = makeTask({
			id: "tidy-docs",
			title: "Tidy docs",
			due: null,
		});

		expect(isDueThisWeek(today)(dueToday)).toBe(true);
		expect(isDueThisWeek(today)(dueInWeek)).toBe(true);
		expect(isDueThisWeek(today)(duePast)).toBe(false);
		expect(isDueThisWeek(today)(dueBeyondWindow)).toBe(false);
		expect(isDueThisWeek(today)(noDue)).toBe(false);
	});

	it("isDeferred matches tasks hidden until a future defer date", () => {
		const today = "2026-02-25";
		const deferred = makeTask({
			id: "audit-logs",
			title: "Audit logs",
			defer_until: "2026-02-26",
		});
		const availableToday = makeTask({
			id: "patch-host",
			title: "Patch host",
			defer_until: "2026-02-25",
		});
		const overdueDefer = makeTask({
			id: "rotate-keys",
			title: "Rotate keys",
			defer_until: "2026-02-24",
		});
		const noDefer = makeTask({
			id: "clean-up",
			title: "Clean up",
			defer_until: null,
		});

		expect(isDeferred(today)(deferred)).toBe(true);
		expect(isDeferred(today)(availableToday)).toBe(false);
		expect(isDeferred(today)(overdueDefer)).toBe(false);
		expect(isDeferred(today)(noDefer)).toBe(false);
	});
});
