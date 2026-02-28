import { describe, expect, it } from "bun:test";
import * as Effect from "effect/Effect";
import type { Task, TaskCreateInput, TaskPatch } from "@tashks/core/schema";
import type { TaskRepositoryService, ListTasksFilters } from "@tashks/core/repository";
import { ready } from "./ready.js";
import { create } from "./create.js";
import { update } from "./update.js";
import { show } from "./show.js";
import { close } from "./close.js";
import { list } from "./list.js";
import { dep } from "./dep.js";
import { comments } from "./comments.js";
import { status } from "./status.js";
import { prime } from "./prime.js";
import { deleteTool } from "./delete.js";
import { allTools } from "./index.js";

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

function makeMockRepo(opts: {
	tasks?: Task[];
	onCreateTask?: (input: TaskCreateInput) => Task;
	onUpdateTask?: (id: string, patch: TaskPatch) => Task;
	onCompleteTask?: (id: string) => Task;
}): TaskRepositoryService {
	const tasks = opts.tasks ?? [];
	return {
		listTasks: (_filters?: ListTasksFilters) => Effect.succeed(tasks),
		getTask: (id: string) => {
			const task = tasks.find((t) => t.id === id);
			return task ? Effect.succeed(task) : Effect.fail(`Task not found: ${id}`);
		},
		createTask: (input: TaskCreateInput) =>
			Effect.succeed(opts.onCreateTask?.(input) ?? makeTask({ id: "new-1", title: input.title })),
		updateTask: (id: string, patch: TaskPatch) =>
			Effect.succeed(
				opts.onUpdateTask?.(id, patch) ??
					makeTask({ ...tasks.find((t) => t.id === id)!, ...patch } as Task),
			),
		completeTask: (id: string) =>
			Effect.succeed(
				opts.onCompleteTask?.(id) ??
					makeTask({ ...tasks.find((t) => t.id === id)!, status: "done", completed_at: new Date().toISOString() }),
			),
		deleteTask: () => Effect.succeed({ deleted: true }),
		generateNextRecurrence: () => Effect.succeed(makeTask({ id: "gen", title: "gen" })),
		processDueRecurrences: () => Effect.succeed({ created: [], replaced: [] }),
		setDailyHighlight: () => Effect.succeed(makeTask({ id: "hl", title: "hl" })),
		listStale: () => Effect.succeed([]),
		listWorkLog: () => Effect.succeed([]),
		createWorkLogEntry: () => Effect.fail("not implemented"),
		updateWorkLogEntry: () => Effect.fail("not implemented"),
		deleteWorkLogEntry: () => Effect.succeed({ deleted: true }),
		importTask: () => Effect.fail("not implemented"),
		importWorkLogEntry: () => Effect.fail("not implemented"),
		listProjects: () => Effect.succeed([]),
		getProject: () => Effect.fail("not implemented"),
		createProject: () => Effect.fail("not implemented"),
		updateProject: () => Effect.fail("not implemented"),
		deleteProject: () => Effect.succeed({ deleted: true }),
		importProject: () => Effect.fail("not implemented"),
	} as unknown as TaskRepositoryService;
}

// ── allTools ──────────────────────────────────────────────────────────

describe("allTools", () => {
	it("exports 11 tools", () => {
		expect(allTools).toHaveLength(11);
	});

	it("each tool has required shape", () => {
		for (const tool of allTools) {
			expect(typeof tool.name).toBe("string");
			expect(typeof tool.description).toBe("string");
			expect(typeof tool.parameters).toBe("object");
			expect(typeof tool.execute).toBe("function");
		}
	});
});

// ── ready ─────────────────────────────────────────────────────────────

describe("tashks_ready", () => {
	it("returns sorted, sliced tasks", async () => {
		const tasks = [
			makeTask({ id: "low", title: "Low", priority: 3 }),
			makeTask({ id: "high", title: "High", priority: 0 }),
			makeTask({ id: "mid", title: "Mid", priority: 1 }),
		];
		const repo = makeMockRepo({ tasks });
		const result = await ready.execute({ limit: 2 }, repo);
		const data = result.data as Task[];
		expect(data).toHaveLength(2);
		expect(data[0].id).toBe("high");
		expect(data[1].id).toBe("mid");
	});

	it("returns error text on failure", async () => {
		const repo = makeMockRepo({});
		// Override listTasks to fail
		(repo as any).listTasks = () => Effect.fail("db down");
		const result = await ready.execute({}, repo);
		expect(result.text).toStartWith("Error:");
	});
});

// ── create ────────────────────────────────────────────────────────────

describe("tashks_create", () => {
	it("passes input to repo and returns created task", async () => {
		let capturedInput: TaskCreateInput | null = null;
		const repo = makeMockRepo({
			onCreateTask: (input) => {
				capturedInput = input;
				return makeTask({ id: "created-1", title: input.title, priority: (input as any).priority ?? null });
			},
		});
		const result = await create.execute({ title: "New task", priority: 2 }, repo);
		const data = result.data as Task;
		expect(data.id).toBe("created-1");
		expect(data.title).toBe("New task");
		expect(capturedInput).not.toBeNull();
		expect(capturedInput!.title).toBe("New task");
	});
});

// ── update ────────────────────────────────────────────────────────────

describe("tashks_update", () => {
	it("constructs patch with claim logic", async () => {
		let capturedPatch: TaskPatch | null = null;
		const tasks = [makeTask({ id: "t1", title: "Task 1" })];
		const repo = makeMockRepo({
			tasks,
			onUpdateTask: (_id, patch) => {
				capturedPatch = patch;
				return makeTask({ id: "t1", title: "Task 1", ...patch } as any);
			},
		});
		await update.execute({ id: "t1", claim: true, assignee: "agent" }, repo);
		expect(capturedPatch).not.toBeNull();
		expect((capturedPatch as any).assignee).toBe("agent");
		expect((capturedPatch as any).status).toBe("in_progress");
	});

	it("does not set status when claim is true even if status is provided", async () => {
		let capturedPatch: TaskPatch | null = null;
		const tasks = [makeTask({ id: "t1", title: "Task 1" })];
		const repo = makeMockRepo({
			tasks,
			onUpdateTask: (_id, patch) => {
				capturedPatch = patch;
				return makeTask({ id: "t1", title: "Task 1", ...patch } as any);
			},
		});
		await update.execute({ id: "t1", claim: true, status: "done" }, repo);
		// claim overrides: status should be "in_progress", not "done"
		expect((capturedPatch as any).status).toBe("in_progress");
	});

	it("claim without assignee defaults to agent", async () => {
		let capturedPatch: TaskPatch | null = null;
		const tasks = [makeTask({ id: "t1", title: "Task 1" })];
		const repo = makeMockRepo({
			tasks,
			onUpdateTask: (_id, patch) => {
				capturedPatch = patch;
				return makeTask({ id: "t1", title: "Task 1", ...patch } as any);
			},
		});
		await update.execute({ id: "t1", claim: true }, repo);
		expect(capturedPatch).not.toBeNull();
		expect((capturedPatch as any).assignee).toBe("agent");
		expect((capturedPatch as any).status).toBe("in_progress");
	});
});

// ── show ──────────────────────────────────────────────────────────────

describe("tashks_show", () => {
	it("returns task by ID", async () => {
		const tasks = [makeTask({ id: "t1", title: "Found it" })];
		const repo = makeMockRepo({ tasks });
		const result = await show.execute({ id: "t1" }, repo);
		const data = result.data as Task;
		expect(data.id).toBe("t1");
		expect(data.title).toBe("Found it");
	});

	it("returns error for missing task", async () => {
		const repo = makeMockRepo({ tasks: [] });
		const result = await show.execute({ id: "missing" }, repo);
		expect(result.text).toStartWith("Error:");
	});
});

// ── close ─────────────────────────────────────────────────────────────

describe("tashks_close", () => {
	it("sets close_reason then completes", async () => {
		const updateCalls: Array<{ id: string; patch: any }> = [];
		const tasks = [makeTask({ id: "t1", title: "Close me" })];
		const repo = makeMockRepo({
			tasks,
			onUpdateTask: (id, patch) => {
				updateCalls.push({ id, patch });
				return makeTask({ id, title: "Close me", ...patch } as any);
			},
			onCompleteTask: (id) =>
				makeTask({ id, title: "Close me", status: "done", completed_at: "2026-02-28T00:00:00Z" }),
		});
		const result = await close.execute({ id: "t1", reason: "shipped" }, repo);
		expect(updateCalls).toHaveLength(1);
		expect(updateCalls[0].patch.close_reason).toBe("shipped");
		expect((result.data as Task).status).toBe("done");
	});

	it("completes without reason", async () => {
		const tasks = [makeTask({ id: "t1", title: "Close me" })];
		const repo = makeMockRepo({ tasks });
		const result = await close.execute({ id: "t1" }, repo);
		expect((result.data as Task).status).toBe("done");
	});
});

// ── list ──────────────────────────────────────────────────────────────

describe("tashks_list", () => {
	it("defaults to active status filter", async () => {
		let capturedFilters: ListTasksFilters | undefined;
		const repo = makeMockRepo({ tasks: [] });
		(repo as any).listTasks = (filters?: ListTasksFilters) => {
			capturedFilters = filters;
			return Effect.succeed([]);
		};
		await list.execute({}, repo);
		expect(capturedFilters?.status).toBe("active");
	});

	it("filters by query in-memory", async () => {
		const tasks = [
			makeTask({ id: "t1", title: "Fix the bug" }),
			makeTask({ id: "t2", title: "Add feature" }),
		];
		const repo = makeMockRepo({ tasks });
		const result = await list.execute({ query: "bug" }, repo);
		const data = result.data as Task[];
		expect(data).toHaveLength(1);
		expect(data[0].id).toBe("t1");
	});

	it("applies limit", async () => {
		const tasks = [
			makeTask({ id: "t1", title: "A" }),
			makeTask({ id: "t2", title: "B" }),
			makeTask({ id: "t3", title: "C" }),
		];
		const repo = makeMockRepo({ tasks });
		const result = await list.execute({ limit: 2 }, repo);
		expect((result.data as Task[]).length).toBe(2);
	});
});

// ── dep ───────────────────────────────────────────────────────────────

describe("tashks_dep", () => {
	it("add: appends dependency", async () => {
		let capturedPatch: any = null;
		const tasks = [makeTask({ id: "t1", title: "A", blocked_by: ["existing"] })];
		const repo = makeMockRepo({
			tasks,
			onUpdateTask: (_id, patch) => {
				capturedPatch = patch;
				return makeTask({ id: "t1", title: "A", ...patch } as any);
			},
		});
		await dep.execute({ action: "add", id: "t1", depends_on: "new-dep" }, repo);
		expect(capturedPatch.blocked_by).toEqual(["existing", "new-dep"]);
	});

	it("add: does not duplicate existing dependency", async () => {
		let capturedPatch: any = null;
		const tasks = [makeTask({ id: "t1", title: "A", blocked_by: ["dep1"] })];
		const repo = makeMockRepo({
			tasks,
			onUpdateTask: (_id, patch) => {
				capturedPatch = patch;
				return makeTask({ id: "t1", title: "A", ...patch } as any);
			},
		});
		await dep.execute({ action: "add", id: "t1", depends_on: "dep1" }, repo);
		expect(capturedPatch.blocked_by).toEqual(["dep1"]);
	});

	it("remove: filters out dependency", async () => {
		let capturedPatch: any = null;
		const tasks = [makeTask({ id: "t1", title: "A", blocked_by: ["dep1", "dep2"] })];
		const repo = makeMockRepo({
			tasks,
			onUpdateTask: (_id, patch) => {
				capturedPatch = patch;
				return makeTask({ id: "t1", title: "A", ...patch } as any);
			},
		});
		await dep.execute({ action: "remove", id: "t1", depends_on: "dep1" }, repo);
		expect(capturedPatch.blocked_by).toEqual(["dep2"]);
	});

	it("tree: returns dependency chain", async () => {
		const tasks = [
			makeTask({ id: "root", title: "Root" }),
			makeTask({ id: "mid", title: "Mid", blocked_by: ["root"] }),
			makeTask({ id: "leaf", title: "Leaf", blocked_by: ["mid"] }),
		];
		const repo = makeMockRepo({ tasks });
		const result = await dep.execute({ action: "tree", id: "mid" }, repo);
		const data = result.data as any;
		expect(data.target.id).toBe("mid");
		expect(data.ancestors.map((t: Task) => t.id)).toContain("root");
		expect(data.descendants.map((t: Task) => t.id)).toContain("leaf");
	});

	it("blocked: returns blocked tasks", async () => {
		const tasks = [
			makeTask({ id: "blocker", title: "Blocker" }),
			makeTask({ id: "blocked", title: "Blocked", blocked_by: ["blocker"] }),
		];
		const repo = makeMockRepo({ tasks });
		const result = await dep.execute({ action: "blocked" }, repo);
		const data = result.data as Task[];
		expect(data).toHaveLength(1);
		expect(data[0].id).toBe("blocked");
	});

	it("add: returns structured error when missing params", async () => {
		const repo = makeMockRepo({});
		const result = await dep.execute({ action: "add" }, repo);
		expect(result.text).toStartWith("Error:");
		expect(result.error).toBeDefined();
		expect(result.error!.code).toBe("VALIDATION");
	});
});

// ── comments ──────────────────────────────────────────────────────────

describe("tashks_comments", () => {
	it("add: appends comment", async () => {
		let capturedPatch: any = null;
		const tasks = [makeTask({ id: "t1", title: "A", comments: [{ text: "old", author: "human", created: "2026-01-01" }] })];
		const repo = makeMockRepo({
			tasks,
			onUpdateTask: (_id, patch) => {
				capturedPatch = patch;
				return makeTask({ id: "t1", title: "A", comments: patch.comments as any });
			},
		});
		await comments.execute({ action: "add", id: "t1", text: "new comment" }, repo);
		expect(capturedPatch.comments).toHaveLength(2);
		expect(capturedPatch.comments[1].text).toBe("new comment");
		expect(capturedPatch.comments[1].author).toBe("agent");
	});

	it("list: returns existing comments", async () => {
		const tasks = [makeTask({ id: "t1", title: "A", comments: [{ text: "hello", author: "human", created: "2026-01-01" }] })];
		const repo = makeMockRepo({ tasks });
		const result = await comments.execute({ action: "list", id: "t1" }, repo);
		const data = result.data as any[];
		expect(data).toHaveLength(1);
		expect(data[0].text).toBe("hello");
	});

	it("add: returns structured error when text missing", async () => {
		const tasks = [makeTask({ id: "t1", title: "A" })];
		const repo = makeMockRepo({ tasks });
		const result = await comments.execute({ action: "add", id: "t1" }, repo);
		expect(result.text).toStartWith("Error:");
		expect(result.error).toBeDefined();
		expect(result.error!.code).toBe("VALIDATION");
		expect(result.error!.message).toContain("text required for add");
	});

	it("add: uses date-only format for created field", async () => {
		let capturedPatch: any = null;
		const tasks = [makeTask({ id: "t1", title: "A", comments: [] })];
		const repo = makeMockRepo({
			tasks,
			onUpdateTask: (_id, patch) => {
				capturedPatch = patch;
				return makeTask({ id: "t1", title: "A", comments: patch.comments as any });
			},
		});
		await comments.execute({ action: "add", id: "t1", text: "test" }, repo);
		const created = capturedPatch.comments[0].created;
		// Date-only: YYYY-MM-DD (10 chars, no T)
		expect(created).toHaveLength(10);
		expect(created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

// ── status ────────────────────────────────────────────────────────────

describe("tashks_status", () => {
	it("computes correct counts", async () => {
		const tasks = [
			makeTask({ id: "a1", title: "A1", status: "active" }),
			makeTask({ id: "a2", title: "A2", status: "active", blocked_by: ["a1"] }),
			makeTask({ id: "d1", title: "D1", status: "done" }),
			makeTask({ id: "d2", title: "D2", status: "deferred" }),
		];
		const repo = makeMockRepo({ tasks });
		const result = await status.execute({} as any, repo);
		const data = result.data as any;
		expect(data.total).toBe(4);
		expect(data.by_status.active).toBe(2);
		expect(data.by_status.done).toBe(1);
		expect(data.by_status.deferred).toBe(1);
		expect(data.ready).toBe(1);
		expect(data.blocked).toBe(1);
	});
});

// ── prime ─────────────────────────────────────────────────────────────

describe("tashks_prime", () => {
	it("generates markdown with board summary sections (no preamble)", async () => {
		const tasks = [
			makeTask({ id: "ready1", title: "Ready Task", priority: 1 }),
			makeTask({ id: "blocked1", title: "Blocked Task", blocked_by: ["ready1"] }),
			makeTask({ id: "defer1", title: "Deferred Task", status: "deferred" }),
			makeTask({ id: "done1", title: "Done Task", status: "done", completed_at: "2026-02-27T10:00:00Z" }),
		];
		const repo = makeMockRepo({ tasks });
		const result = await prime.execute({} as any, repo);
		expect(result.text).not.toContain("## Task Tracking Rules");
		expect(result.text).toContain("## Task Board");
		expect(result.text).toContain("### Ready");
		expect(result.text).toContain("### Blocked");
		expect(result.text).toContain("### Deferred");
		expect(result.text).toContain("### Recently Done");
		expect(result.text).toContain("ready1");
		expect(result.text).toContain("blocked1");

		const data = result.data as any;
		expect(data.total).toBe(4);
		expect(data.ready).toBe(1);
		expect(data.blocked).toBe(1);
		expect(data.deferred).toBe(1);
		expect(data.done).toBe(1);
	});

	it("omits empty sections", async () => {
		const tasks = [makeTask({ id: "ready1", title: "Ready Task" })];
		const repo = makeMockRepo({ tasks });
		const result = await prime.execute({} as any, repo);
		expect(result.text).toContain("### Ready");
		expect(result.text).not.toContain("### Blocked");
		expect(result.text).not.toContain("### Deferred");
		expect(result.text).not.toContain("### Recently Done");
	});

// ── delete ────────────────────────────────────────────────────────────

describe("tashks_delete", () => {
	it("deletes a task and returns confirmation", async () => {
		const tasks = [makeTask({ id: "t1", title: "Delete me" })];
		const repo = makeMockRepo({ tasks });
		const result = await deleteTool.execute({ id: "t1" }, repo);
		expect(result.text).toContain("Deleted task t1");
		expect(result.data).toEqual({ deleted: true, id: "t1" });
	});

	it("returns structured error on failure", async () => {
		const repo = makeMockRepo({});
		(repo as any).deleteTask = () => Effect.fail("Task not found: missing");
		const result = await deleteTool.execute({ id: "missing" }, repo);
		expect(result.text).toStartWith("Error:");
		expect(result.error).toBeDefined();
		expect(result.error!.code).toBe("NOT_FOUND");
		expect(result.error!.message).toContain("not found");
	});
});

// ── structured errors ────────────────────────────────────────────────

describe("structured errors", () => {
	it("ready returns structured error on failure", async () => {
		const repo = makeMockRepo({});
		(repo as any).listTasks = () => Effect.fail("db down");
		const result = await ready.execute({}, repo);
		expect(result.text).toStartWith("Error:");
		expect(result.error).toBeDefined();
		expect(result.error!.code).toBe("UNKNOWN");
		expect(result.error!.message).toContain("db down");
	});

	it("show returns NOT_FOUND for missing task", async () => {
		const repo = makeMockRepo({ tasks: [] });
		const result = await show.execute({ id: "missing" }, repo);
		expect(result.error).toBeDefined();
		expect(result.error!.code).toBe("NOT_FOUND");
	});
});
});
