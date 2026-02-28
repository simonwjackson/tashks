import type { TaskRepositoryService, ListTasksFilters } from "@tashks/core/repository";
import { byPriorityAsc, byUrgencyDesc, byCreatedAsc } from "@tashks/core/query";
import * as Effect from "effect/Effect";
import type { ToolDefinition, ToolResult } from "../types.js";

export interface ReadyParams {
	limit?: number;
	assignee?: string;
	priority?: number;
	type?: string;
	unassigned?: boolean;
}

async function execute(params: ReadyParams, repo: TaskRepositoryService): Promise<ToolResult> {
	try {
		const filters: ListTasksFilters = {
			status: "active",
			unblocked_only: true,
			...(params.assignee && { assignee: params.assignee }),
			...(params.priority != null && { priority: params.priority }),
			...(params.type && { type: params.type }),
			...(params.unassigned && { unassigned: true }),
		};
		let tasks = await Effect.runPromise(repo.listTasks(filters));
		tasks.sort((a, b) => byPriorityAsc(a, b) || byUrgencyDesc(a, b) || byCreatedAsc(a, b));
		if (params.limit) tasks = tasks.slice(0, params.limit);
		return { text: JSON.stringify(tasks, null, 2), data: tasks };
	} catch (e) {
		return { text: `Error: ${String(e)}` };
	}
}

export const ready: ToolDefinition<ReadyParams> = {
	name: "tashks_ready",
	description: "Show ready work — tasks with no blockers that are active",
	parameters: {
		type: "object",
		properties: {
			limit: { type: "number", description: "Max tasks to show (default 10)" },
			assignee: { type: "string", description: "Filter by assignee" },
			priority: { type: "number", description: "Filter by priority (0-4, 0=highest)" },
			type: { type: "string", description: "Task type filter (task, bug, feature, epic, chore)" },
			unassigned: { type: "boolean", description: "Show only unassigned tasks" },
		},
		required: [],
	},
	execute,
};
