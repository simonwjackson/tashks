import type { TaskRepositoryService } from "@tashks/core/repository";
import { isBlocked, buildDependencyChain } from "@tashks/core/query";
import * as Effect from "effect/Effect";
import type { ToolDefinition, ToolResult } from "../types.js";
import { toolError } from "../errors.js";

export interface DepParams {
	action: "add" | "remove" | "tree" | "blocked";
	id?: string;
	depends_on?: string;
}

async function execute(params: DepParams, repo: TaskRepositoryService): Promise<ToolResult> {
	try {
		switch (params.action) {
			case "add": {
				if (!params.id || !params.depends_on) return { text: "Error: id and depends_on required for add", error: { code: "VALIDATION", message: "id and depends_on required for add" } };
				const task = await Effect.runPromise(repo.getTask(params.id));
				const blockedBy = [...task.blocked_by];
				if (!blockedBy.includes(params.depends_on)) blockedBy.push(params.depends_on);
				const updated = await Effect.runPromise(repo.updateTask(params.id, { blocked_by: blockedBy }));
				return { text: JSON.stringify(updated, null, 2), data: updated };
			}
			case "remove": {
				if (!params.id || !params.depends_on) return { text: "Error: id and depends_on required for remove", error: { code: "VALIDATION", message: "id and depends_on required for remove" } };
				const task = await Effect.runPromise(repo.getTask(params.id));
				const blockedBy = task.blocked_by.filter((id) => id !== params.depends_on);
				const updated = await Effect.runPromise(repo.updateTask(params.id, { blocked_by: blockedBy }));
				return { text: JSON.stringify(updated, null, 2), data: updated };
			}
			case "tree": {
				if (!params.id) return { text: "Error: id required for tree", error: { code: "VALIDATION", message: "id required for tree" } };
				const allTasks = await Effect.runPromise(repo.listTasks({}));
				const chain = buildDependencyChain(params.id, allTasks);
				return { text: JSON.stringify(chain, null, 2), data: chain };
			}
			case "blocked": {
				const allTasks = await Effect.runPromise(repo.listTasks({ status: "active" }));
				const blocked = allTasks.filter((t) => isBlocked(t, allTasks));
				return { text: JSON.stringify(blocked, null, 2), data: blocked };
			}
		}
	} catch (e) {
		return toolError(e);
	}
}

export const dep: ToolDefinition<DepParams> = {
	name: "tashks_dep",
	description: "Manage task dependencies. Actions: add (create dep), remove (delete dep), tree (dep tree), blocked (all blocked tasks)",
	parameters: {
		type: "object",
		properties: {
			action: { type: "string", enum: ["add", "remove", "tree", "blocked"], description: "Dependency action" },
			id: { type: "string", description: "Task ID" },
			depends_on: { type: "string", description: "Dependency task ID (for add/remove)" },
		},
		required: ["action"],
	},
	execute,
};
