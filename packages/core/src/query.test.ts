import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import type { Task, Project } from "./schema.js";
import {
	applyPerspectiveToTasks,
	byCreatedAsc,
	byDueAsc,
	byEnergyAsc,
	byPriorityAsc,
	byUrgencyDesc,
	byUpdatedDescThenTitle,
	buildDependencyChain,
	hasContext,
	hasDurationMax,
	hasDurationMin,
	hasEnergy,
	hasProject,
	hasTag,
	isBlocked,
	isStalerThan,
	isDeferred,
	isDueBefore,
	isDueThisWeek,
	isUnblocked,
	listAreas,
	listContexts,
	loadPerspectiveConfig,
	resolveRelativeDate,
	wasCompletedBetween,
	wasCompletedOn,
} from "./query.js";

const makeTask = (
	overrides: Partial<Task> & Pick<Task, "id" | "title">,
): Task => ({
	id: overrides.id,
	title: overrides.title,
	status: overrides.status ?? "active",
	area: overrides.area ?? "personal",
	projects: overrides.projects ?? [],
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
	related: overrides.related ?? [],
	is_template: overrides.is_template ?? false,
	from_template: overrides.from_template ?? null,
	priority: overrides.priority ?? null,
	type: overrides.type ?? "task",
	assignee: overrides.assignee ?? null,
	parent: overrides.parent ?? null,
	close_reason: overrides.close_reason ?? null,
	description: overrides.description ?? "",
	comments: overrides.comments ?? [],
});

const writePerspectiveConfig = async (
	dataDir: string,
	source: string,
): Promise<void> => {
	await mkdir(dataDir, { recursive: true });
	await writeFile(join(dataDir, "perspectives.yaml"), source, "utf8");
};

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

describe("query metadata predicates", () => {
	it("filters by energy level", () => {
		const lowEnergy = makeTask({
			id: "read-spec",
			title: "Read spec",
			energy: "low",
		});
		const highEnergy = makeTask({
			id: "refactor-repo",
			title: "Refactor repo",
			energy: "high",
		});

		expect(hasEnergy("low")(lowEnergy)).toBe(true);
		expect(hasEnergy("low")(highEnergy)).toBe(false);
	});

	it("filters by tag", () => {
		const tagged = makeTask({
			id: "buy-cables",
			title: "Buy cables",
			tags: ["errands", "hardware"],
		});
		const untagged = makeTask({
			id: "write-docs",
			title: "Write docs",
			tags: ["writing"],
		});

		expect(hasTag("hardware")(tagged)).toBe(true);
		expect(hasTag("hardware")(untagged)).toBe(false);
	});

	it("filters by project", () => {
		const withProject = makeTask({
			id: "rack-layout",
			title: "Plan rack layout",
			projects: ["homelab"],
		});
		const withMultipleProjects = makeTask({
			id: "cross-project",
			title: "Cross-project task",
			projects: ["homelab", "blog-refresh"],
		});
		const withOtherProject = makeTask({
			id: "site-redesign",
			title: "Site redesign",
			projects: ["blog-refresh"],
		});
		const withoutProject = makeTask({
			id: "desk-reset",
			title: "Desk reset",
			projects: [],
		});

		expect(hasProject("homelab")(withProject)).toBe(true);
		expect(hasProject("homelab")(withMultipleProjects)).toBe(true);
		expect(hasProject("homelab")(withOtherProject)).toBe(false);
		expect(hasProject("homelab")(withoutProject)).toBe(false);
	});
});

describe("query staleness predicates", () => {
	it("treats tasks older than threshold days as stale", () => {
		const stale = makeTask({
			id: "stale-task",
			title: "Stale task",
			updated: "2026-02-10",
		});
		const boundary = makeTask({
			id: "boundary-task",
			title: "Boundary task",
			updated: "2026-02-11",
		});

		expect(isStalerThan(14, "2026-02-25")(stale)).toBe(true);
		expect(isStalerThan(14, "2026-02-25")(boundary)).toBe(false);
	});

	it("returns false when dates are invalid", () => {
		const invalidUpdated = makeTask({
			id: "invalid-updated",
			title: "Invalid updated",
			updated: "not-a-date",
		});

		expect(isStalerThan(3, "2026-02-25")(invalidUpdated)).toBe(false);
		expect(isStalerThan(3, "not-a-date")(invalidUpdated)).toBe(false);
	});
});

describe("query completion predicates", () => {
	it("matches tasks completed on a specific date", () => {
		const completed = makeTask({
			id: "publish-post",
			title: "Publish post",
			completed_at: "2026-02-25T10:15:00Z",
		});
		const differentDate = makeTask({
			id: "ship-patch",
			title: "Ship patch",
			completed_at: "2026-02-24T23:59:59Z",
		});
		const incomplete = makeTask({
			id: "open-task",
			title: "Open task",
			completed_at: null,
		});
		const invalidCompleted = makeTask({
			id: "invalid-completed",
			title: "Invalid completed",
			completed_at: "nope",
		});

		expect(wasCompletedOn("2026-02-25")(completed)).toBe(true);
		expect(wasCompletedOn("2026-02-25")(differentDate)).toBe(false);
		expect(wasCompletedOn("2026-02-25")(incomplete)).toBe(false);
		expect(wasCompletedOn("2026-02-25")(invalidCompleted)).toBe(false);
	});

	it("matches completion dates within inclusive boundaries", () => {
		const startBoundary = makeTask({
			id: "start-boundary",
			title: "Start boundary",
			completed_at: "2026-02-20T00:00:00Z",
		});
		const middle = makeTask({
			id: "middle-boundary",
			title: "Middle boundary",
			completed_at: "2026-02-22T09:30:00Z",
		});
		const endBoundary = makeTask({
			id: "end-boundary",
			title: "End boundary",
			completed_at: "2026-02-25T23:59:59Z",
		});
		const outside = makeTask({
			id: "outside-range",
			title: "Outside range",
			completed_at: "2026-02-26T00:00:00Z",
		});
		const invalidCompleted = makeTask({
			id: "invalid-range-date",
			title: "Invalid range date",
			completed_at: "invalid",
		});

		const withinWindow = wasCompletedBetween("2026-02-20", "2026-02-25");
		expect(withinWindow(startBoundary)).toBe(true);
		expect(withinWindow(middle)).toBe(true);
		expect(withinWindow(endBoundary)).toBe(true);
		expect(withinWindow(outside)).toBe(false);
		expect(withinWindow(invalidCompleted)).toBe(false);
	});
});

describe("query sort helpers", () => {
	it("sorts by due date ascending with null due dates last", () => {
		const earlyDue = makeTask({
			id: "due-early",
			title: "Due early",
			due: "2026-02-26",
		});
		const lateDue = makeTask({
			id: "due-late",
			title: "Due late",
			due: "2026-03-03",
		});
		const noDue = makeTask({
			id: "no-due",
			title: "No due",
			due: null,
		});

		const sorted = [noDue, lateDue, earlyDue].sort(byDueAsc);
		expect(sorted.map((task) => task.id)).toEqual([
			"due-early",
			"due-late",
			"no-due",
		]);
	});

	it("sorts by energy low to high", () => {
		const high = makeTask({
			id: "high-energy",
			title: "High energy",
			energy: "high",
		});
		const low = makeTask({
			id: "low-energy",
			title: "Low energy",
			energy: "low",
		});
		const medium = makeTask({
			id: "medium-energy",
			title: "Medium energy",
			energy: "medium",
		});

		const sorted = [high, medium, low].sort(byEnergyAsc);
		expect(sorted.map((task) => task.id)).toEqual([
			"low-energy",
			"medium-energy",
			"high-energy",
		]);
	});

	it("sorts by created date ascending", () => {
		const older = makeTask({
			id: "older-created",
			title: "Older created",
			created: "2026-02-20",
		});
		const newer = makeTask({
			id: "newer-created",
			title: "Newer created",
			created: "2026-02-22",
		});
		const oldest = makeTask({
			id: "oldest-created",
			title: "Oldest created",
			created: "2026-02-19",
		});

		const sorted = [newer, oldest, older].sort(byCreatedAsc);
		expect(sorted.map((task) => task.id)).toEqual([
			"oldest-created",
			"older-created",
			"newer-created",
		]);
	});

	it("sorts by updated descending then title ascending", () => {
		const newest = makeTask({
			id: "newest",
			title: "Newest item",
			updated: "2026-02-26",
		});
		const alphaAtSameDate = makeTask({
			id: "alpha",
			title: "Alpha",
			updated: "2026-02-25",
		});
		const betaAtSameDate = makeTask({
			id: "beta",
			title: "Beta",
			updated: "2026-02-25",
		});

		const sorted = [betaAtSameDate, newest, alphaAtSameDate].sort(
			byUpdatedDescThenTitle,
		);
		expect(sorted.map((task) => task.id)).toEqual(["newest", "alpha", "beta"]);
	});
});

describe("relative date resolution", () => {
	it("resolves today and +Nd expressions", () => {
		expect(resolveRelativeDate("today", "2026-02-25")).toBe("2026-02-25");
		expect(resolveRelativeDate("+7d", "2026-02-25")).toBe("2026-03-04");
	});

	it("passes through absolute ISO dates", () => {
		expect(resolveRelativeDate("2026-03-01", "2026-02-25")).toBe("2026-03-01");
	});

	it("returns null for unsupported expressions", () => {
		expect(resolveRelativeDate("tomorrow", "2026-02-25")).toBeNull();
		expect(resolveRelativeDate("+2w", "2026-02-25")).toBeNull();
	});
});

describe("perspective config loader", () => {
	it("loads perspective config from perspectives.yaml", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-perspectives-"));

		try {
			await writePerspectiveConfig(
				dataDir,
				[
					"quick-wins:",
					"  filters:",
					"    status: active",
					"    energy: low",
					"    unblocked_only: true",
					"  sort: updated_desc",
					"due-this-week:",
					"  filters:",
					"    status: active",
					"    due_before: '+7d'",
					"  sort: due_asc",
					"done-today:",
					"  filters:",
					"    status: done",
					"    completed_on: today",
				].join("\n"),
			);

			const config = await Effect.runPromise(
				loadPerspectiveConfig(dataDir, "2026-02-25"),
			);
			expect(config).toEqual({
				"done-today": {
					filters: {
						completed_on: "2026-02-25",
						status: "done",
					},
				},
				"due-this-week": {
					filters: {
						due_before: "2026-03-04",
						status: "active",
					},
					sort: "due_asc",
				},
				"quick-wins": {
					filters: {
						energy: "low",
						status: "active",
						unblocked_only: true,
					},
					sort: "updated_desc",
				},
			});
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("returns an empty config when perspectives.yaml does not exist", async () => {
		const dataDir = await mkdtemp(join(tmpdir(), "tasks-perspectives-empty-"));

		try {
			const config = await Effect.runPromise(loadPerspectiveConfig(dataDir));
			expect(config).toEqual({});
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("fails when perspective config includes invalid relative dates", async () => {
		const dataDir = await mkdtemp(
			join(tmpdir(), "tasks-perspectives-relative-invalid-"),
		);

		try {
			await writePerspectiveConfig(
				dataDir,
				[
					"due-this-week:",
					"  filters:",
					"    status: active",
					"    due_before: tomorrow",
				].join("\n"),
			);

			const result = await Effect.runPromiseExit(
				loadPerspectiveConfig(dataDir, "2026-02-25"),
			);
			expect(Exit.isFailure(result)).toBe(true);

			if (Exit.isFailure(result)) {
				const failure = Option.getOrNull(Cause.failureOption(result.cause));
				expect(failure).toBe(
					`Perspective config loader failed: Invalid perspective config in ${join(dataDir, "perspectives.yaml")}`,
				);
			}
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});

	it("fails when perspective config does not match the schema", async () => {
		const dataDir = await mkdtemp(
			join(tmpdir(), "tasks-perspectives-invalid-"),
		);

		try {
			await writePerspectiveConfig(
				dataDir,
				["broken-perspective:", "  filters: not-an-object"].join("\n"),
			);

			const result = await Effect.runPromiseExit(
				loadPerspectiveConfig(dataDir),
			);
			expect(Exit.isFailure(result)).toBe(true);

			if (Exit.isFailure(result)) {
				const failure = Option.getOrNull(Cause.failureOption(result.cause));
				expect(failure).toBe(
					`Perspective config loader failed: Invalid perspective config in ${join(dataDir, "perspectives.yaml")}`,
				);
			}
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});

describe("perspective application", () => {
	it("applies all configured filters and due_asc sort", () => {
		const tasks: Array<Task> = [
			makeTask({
				id: "eligible-later",
				title: "Eligible later",
				status: "active",
				projects: ["homelab"],
				tags: ["ops", "weekly"],
				energy: "low",
				due: "2026-02-27",
				updated: "2026-02-21",
			}),
			makeTask({
				id: "eligible-earlier",
				title: "Eligible earlier",
				status: "active",
				projects: ["homelab"],
				tags: ["ops"],
				energy: "low",
				due: "2026-02-26",
				updated: "2026-02-20",
			}),
			makeTask({
				id: "blocked-task",
				title: "Blocked task",
				status: "active",
				projects: ["homelab"],
				tags: ["ops"],
				energy: "low",
				due: "2026-02-25",
				blocked_by: ["active-blocker"],
			}),
			makeTask({
				id: "active-blocker",
				title: "Active blocker",
				status: "active",
				projects: ["homelab"],
				tags: ["ops"],
				energy: "high",
				due: null,
			}),
			makeTask({
				id: "wrong-energy",
				title: "Wrong energy",
				status: "active",
				projects: ["homelab"],
				tags: ["ops"],
				energy: "medium",
				due: "2026-02-26",
			}),
			makeTask({
				id: "wrong-project",
				title: "Wrong project",
				status: "active",
				projects: ["chores"],
				tags: ["ops"],
				energy: "low",
				due: "2026-02-26",
			}),
		];

		const filtered = applyPerspectiveToTasks(
			tasks,
			{
				filters: {
					status: "active",
					project: "homelab",
					tags: ["ops"],
					energy: "low",
					due_before: "2026-02-27",
					unblocked_only: true,
				},
				sort: "due_asc",
			},
			"2026-02-25",
		);

		expect(filtered.map((task) => task.id)).toEqual([
			"eligible-earlier",
			"eligible-later",
		]);
	});

	it("sorts by completed_at descending when using done-day perspectives", () => {
		const tasks: Array<Task> = [
			makeTask({
				id: "done-morning",
				title: "Done morning",
				status: "done",
				completed_at: "2026-02-25T09:30:00Z",
			}),
			makeTask({
				id: "done-afternoon",
				title: "Done afternoon",
				status: "done",
				completed_at: "2026-02-25T16:45:00Z",
			}),
			makeTask({
				id: "done-other-day",
				title: "Done other day",
				status: "done",
				completed_at: "2026-02-24T12:00:00Z",
			}),
			makeTask({
				id: "active-task",
				title: "Active task",
				status: "active",
				completed_at: null,
			}),
		];

		const filtered = applyPerspectiveToTasks(
			tasks,
			{
				filters: {
					status: "done",
					completed_on: "2026-02-25",
				},
				sort: "completed_at_desc",
			},
			"2026-02-25",
		);

		expect(filtered.map((task) => task.id)).toEqual([
			"done-afternoon",
			"done-morning",
		]);
	});

	it("applies loaded perspective config to tasks after relative date resolution", async () => {
		const dataDir = await mkdtemp(
			join(tmpdir(), "tasks-perspectives-apply-loaded-"),
		);

		try {
			await writePerspectiveConfig(
				dataDir,
				[
					"due-this-week:",
					"  filters:",
					"    status: active",
					"    due_before: '+7d'",
					"    unblocked_only: true",
					"  sort: due_asc",
				].join("\n"),
			);

			const config = await Effect.runPromise(
				loadPerspectiveConfig(dataDir, "2026-02-25"),
			);

			const tasks: Array<Task> = [
				makeTask({
					id: "due-inside-window",
					title: "Due inside window",
					status: "active",
					due: "2026-03-01",
				}),
				makeTask({
					id: "due-tomorrow",
					title: "Due tomorrow",
					status: "active",
					due: "2026-02-26",
				}),
				makeTask({
					id: "due-outside-window",
					title: "Due outside window",
					status: "active",
					due: "2026-03-12",
				}),
				makeTask({
					id: "blocked-weekly-task",
					title: "Blocked weekly task",
					status: "active",
					due: "2026-02-27",
					blocked_by: ["blocker"],
				}),
				makeTask({
					id: "blocker",
					title: "Blocker",
					status: "active",
				}),
			];

			const filtered = applyPerspectiveToTasks(
				tasks,
				config["due-this-week"],
				"2026-02-25",
			);

			expect(filtered.map((task) => task.id)).toEqual([
				"due-tomorrow",
				"due-inside-window",
			]);
		} finally {
			await rm(dataDir, { recursive: true, force: true });
		}
	});
});

const makeProject = (
	overrides: Partial<Project> & Pick<Project, "id" | "title">,
): Project => ({
	id: overrides.id,
	title: overrides.title,
	status: overrides.status ?? "active",
	area: overrides.area ?? "personal",
	description: overrides.description ?? "",
	tags: overrides.tags ?? [],
	created: overrides.created ?? "2026-02-25",
	updated: overrides.updated ?? "2026-02-25",
});

describe("listAreas", () => {
	it("collects unique areas from tasks and projects, sorted", () => {
		const tasks = [
			makeTask({ id: "t1", title: "T1", area: "work" }),
			makeTask({ id: "t2", title: "T2", area: "personal" }),
			makeTask({ id: "t3", title: "T3", area: "work" }),
		];
		const projects = [
			makeProject({ id: "p1", title: "P1", area: "infrastructure" }),
			makeProject({ id: "p2", title: "P2", area: "personal" }),
		];

		expect(listAreas(tasks, projects)).toEqual([
			"infrastructure",
			"personal",
			"work",
		]);
	});

	it("returns empty array when no tasks or projects", () => {
		expect(listAreas([], [])).toEqual([]);
	});

	it("works with custom area strings", () => {
		const tasks = [
			makeTask({ id: "t1", title: "T1", area: "gardening" }),
		];
		const projects = [
			makeProject({ id: "p1", title: "P1", area: "cooking" }),
		];

		expect(listAreas(tasks, projects)).toEqual(["cooking", "gardening"]);
	});
});

describe("duration predicates", () => {
	it("hasDurationMin matches tasks with estimated_minutes >= threshold", () => {
		const short = makeTask({ id: "short", title: "Short", estimated_minutes: 10 });
		const exact = makeTask({ id: "exact", title: "Exact", estimated_minutes: 30 });
		const long = makeTask({ id: "long", title: "Long", estimated_minutes: 60 });
		const none = makeTask({ id: "none", title: "None", estimated_minutes: null });

		expect(hasDurationMin(30)(short)).toBe(false);
		expect(hasDurationMin(30)(exact)).toBe(true);
		expect(hasDurationMin(30)(long)).toBe(true);
		expect(hasDurationMin(30)(none)).toBe(false);
	});

	it("hasDurationMax matches tasks with estimated_minutes <= threshold", () => {
		const short = makeTask({ id: "short", title: "Short", estimated_minutes: 10 });
		const exact = makeTask({ id: "exact", title: "Exact", estimated_minutes: 30 });
		const long = makeTask({ id: "long", title: "Long", estimated_minutes: 60 });
		const none = makeTask({ id: "none", title: "None", estimated_minutes: null });

		expect(hasDurationMax(30)(short)).toBe(true);
		expect(hasDurationMax(30)(exact)).toBe(true);
		expect(hasDurationMax(30)(long)).toBe(false);
		expect(hasDurationMax(30)(none)).toBe(false);
	});
});

describe("context predicate", () => {
	it("hasContext matches tasks with matching context", () => {
		const atHome = makeTask({ id: "home", title: "Home task", context: "@home" });
		const atWork = makeTask({ id: "work", title: "Work task", context: "@work" });
		const noContext = makeTask({ id: "none", title: "No context", context: "" });

		expect(hasContext("@home")(atHome)).toBe(true);
		expect(hasContext("@home")(atWork)).toBe(false);
		expect(hasContext("@home")(noContext)).toBe(false);
	});
});

describe("listContexts", () => {
	it("returns sorted unique non-empty context values", () => {
		const tasks = [
			makeTask({ id: "t1", title: "T1", context: "@work" }),
			makeTask({ id: "t2", title: "T2", context: "@home" }),
			makeTask({ id: "t3", title: "T3", context: "@work" }),
			makeTask({ id: "t4", title: "T4", context: "" }),
		];

		expect(listContexts(tasks)).toEqual(["@home", "@work"]);
	});

	it("returns empty array when no tasks have contexts", () => {
		expect(listContexts([])).toEqual([]);
		expect(listContexts([makeTask({ id: "t1", title: "T1", context: "" })])).toEqual([]);
	});
});

describe("applyPerspectiveToTasks with new filters", () => {
	it("filters by duration_min and duration_max", () => {
		const tasks = [
			makeTask({ id: "short", title: "Short", estimated_minutes: 10 }),
			makeTask({ id: "medium", title: "Medium", estimated_minutes: 30 }),
			makeTask({ id: "long", title: "Long", estimated_minutes: 60 }),
			makeTask({ id: "none", title: "None", estimated_minutes: null }),
		];

		const filtered = applyPerspectiveToTasks(
			tasks,
			{ filters: { duration_min: 15, duration_max: 45 } },
			"2026-02-25",
		);

		expect(filtered.map((t) => t.id)).toEqual(["medium"]);
	});

	it("filters by context", () => {
		const tasks = [
			makeTask({ id: "home", title: "Home", context: "@home" }),
			makeTask({ id: "work", title: "Work", context: "@work" }),
		];

		const filtered = applyPerspectiveToTasks(
			tasks,
			{ filters: { context: "@home" } },
			"2026-02-25",
		);

		expect(filtered.map((t) => t.id)).toEqual(["home"]);
	});

	it("excludes templates by default", () => {
		const tasks = [
			makeTask({ id: "regular", title: "Regular" }),
			makeTask({ id: "template", title: "Template", is_template: true }),
		];

		const filtered = applyPerspectiveToTasks(
			tasks,
			{ filters: {} },
			"2026-02-25",
		);

		expect(filtered.map((t) => t.id)).toEqual(["regular"]);
	});

	it("includes templates when include_templates is true", () => {
		const tasks = [
			makeTask({ id: "regular", title: "Regular" }),
			makeTask({ id: "template", title: "Template", is_template: true }),
		];

		const filtered = applyPerspectiveToTasks(
			tasks,
			{ filters: { include_templates: true } },
			"2026-02-25",
		);

		expect(filtered.map((t) => t.id)).toContain("template");
		expect(filtered.map((t) => t.id)).toContain("regular");
	});
});

describe("byPriorityAsc", () => {
	it("sorts tasks by priority ascending with nulls last", () => {
		const tasks = [
			makeTask({ id: "none", title: "No priority", priority: null }),
			makeTask({ id: "high", title: "High", priority: 0 }),
			makeTask({ id: "low", title: "Low", priority: 3 }),
			makeTask({ id: "mid", title: "Mid", priority: 1 }),
		];

		const sorted = [...tasks].sort(byPriorityAsc);
		expect(sorted.map((t) => t.id)).toEqual(["high", "mid", "low", "none"]);
	});

	it("returns 0 when both priorities are null", () => {
		const a = makeTask({ id: "a", title: "A", priority: null });
		const b = makeTask({ id: "b", title: "B", priority: null });
		expect(byPriorityAsc(a, b)).toBe(0);
	});

	it("returns 0 when priorities are equal", () => {
		const a = makeTask({ id: "a", title: "A", priority: 2 });
		const b = makeTask({ id: "b", title: "B", priority: 2 });
		expect(byPriorityAsc(a, b)).toBe(0);
	});
});

describe("byUrgencyDesc", () => {
	it("sorts tasks by urgency descending (high first)", () => {
		const tasks = [
			makeTask({ id: "low", title: "Low", urgency: "low" }),
			makeTask({ id: "high", title: "High", urgency: "high" }),
			makeTask({ id: "med", title: "Med", urgency: "medium" }),
		];

		const sorted = [...tasks].sort(byUrgencyDesc);
		expect(sorted.map((t) => t.id)).toEqual(["high", "med", "low"]);
	});
});

describe("buildDependencyChain", () => {
	it("finds ancestors and descendants of a target task", () => {
		const tasks = [
			makeTask({ id: "root", title: "Root" }),
			makeTask({ id: "mid", title: "Mid", blocked_by: ["root"] }),
			makeTask({ id: "leaf", title: "Leaf", blocked_by: ["mid"] }),
		];

		const chain = buildDependencyChain("mid", tasks);
		expect(chain.target?.id).toBe("mid");
		expect(chain.ancestors.map((t) => t.id)).toEqual(["root"]);
		expect(chain.descendants.map((t) => t.id)).toEqual(["leaf"]);
	});

	it("returns null target when id not found", () => {
		const chain = buildDependencyChain("missing", []);
		expect(chain.target).toBeNull();
		expect(chain.ancestors).toEqual([]);
		expect(chain.descendants).toEqual([]);
	});
});
