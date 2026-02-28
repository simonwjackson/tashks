import type { TaskRepositoryService } from "@tashks/core/repository";
import type { TaskCreateInput } from "@tashks/core/schema";
import * as Effect from "effect/Effect";
import type { ToolDefinition, ToolResult } from "../types.js";

export interface CreateParams {
	title: string;
	description?: string;
	priority?: number;
	type?: string;
	assignee?: string;
	tags?: string[];
	parent?: string;
	blocked_by?: string[];
	estimated_minutes?: number;
}

async function execute(params: CreateParams, repo: TaskRepositoryService): Promise<ToolResult> {
	try {
		const input: TaskCreateInput = {
			title: params.title,
			...(params.description != null && { description: params.description }),
			...(params.priority != null && { priority: params.priority }),
			...(params.type && { type: params.type }),
			...(params.assignee && { assignee: params.assignee }),
			...(params.tags?.length && { tags: params.tags }),
			...(params.parent && { parent: params.parent }),
			...(params.blocked_by?.length && { blocked_by: params.blocked_by }),
			...(params.estimated_minutes != null && { estimated_minutes: params.estimated_minutes }),
		};
		const task = await Effect.runPromise(repo.createTask(input));
		return { text: JSON.stringify(task, null, 2), data: task };
	} catch (e) {
		return { text: `Error: ${String(e)}` };
	}
}

export const create: ToolDefinition<CreateParams> = {
	name: "tashks_create",
	description: "Create a new task",
	parameters: {
		type: "object",
		properties: {
			title: { type: "string", description: "Task title" },
			description: { type: "string", description: "Task description" },
			priority: { type: "number", description: "Priority (0-4, 0=critical)" },
			type: { type: "string", description: "Task type (task, bug, feature, epic, chore)" },
			assignee: { type: "string", description: "Assignee" },
			tags: { type: "array", items: { type: "string" }, description: "Tags" },
			parent: { type: "string", description: "Parent task ID" },
			blocked_by: { type: "array", items: { type: "string" }, description: "Dependency task IDs" },
			estimated_minutes: { type: "number", description: "Time estimate in minutes" },
		},
		required: ["title"],
	},
	execute,
};
