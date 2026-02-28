import type { TaskRepositoryService, ListTasksFilters } from "@tashks/core/repository";
import * as Effect from "effect/Effect";
import type { ToolDefinition, ToolResult } from "../types.js";
import { toolError } from "../errors.js";

export interface ListParams {
	query?: string;
	status?: string;
	priority?: number;
	assignee?: string;
	type?: string;
	tags?: string[];
	limit?: number;
	all?: boolean;
	unassigned?: boolean;
	parent?: string;
}

async function execute(params: ListParams, repo: TaskRepositoryService): Promise<ToolResult> {
	try {
		const filters: ListTasksFilters = {
			...(!params.all && !params.status && { status: "active" }),
			...(params.status && { status: params.status }),
			...(params.priority != null && { priority: params.priority }),
			...(params.assignee && { assignee: params.assignee }),
			...(params.type && { type: params.type }),
			...(params.tags?.length && { tags: params.tags }),
			...(params.unassigned && { unassigned: true }),
			...(params.parent && { parent: params.parent }),
		};

		let tasks = await Effect.runPromise(repo.listTasks(filters));

		if (params.query) {
			const q = params.query.toLowerCase();
			tasks = tasks.filter(
				(t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
			);
		}

		if (params.limit) tasks = tasks.slice(0, params.limit);
		return { text: JSON.stringify(tasks, null, 2), data: tasks };
	} catch (e) {
		return toolError(e);
	}
}

export const list: ToolDefinition<ListParams> = {
	name: "tashks_list",
	description: "List or search tasks. Provide `query` to search by text.",
	parameters: {
		type: "object",
		properties: {
			query: { type: "string", description: "Text search query" },
			status: { type: "string", description: "Filter by status" },
			priority: { type: "number", description: "Filter by priority (0-4)" },
			assignee: { type: "string", description: "Filter by assignee" },
			type: { type: "string", description: "Filter by type" },
			tags: { type: "array", items: { type: "string" }, description: "Filter by tags (AND)" },
			limit: { type: "number", description: "Max results" },
			all: { type: "boolean", description: "Include done/dropped tasks" },
			unassigned: { type: "boolean", description: "Only unassigned" },
			parent: { type: "string", description: "Filter by parent task ID" },
		},
		required: [],
	},
	execute,
};
