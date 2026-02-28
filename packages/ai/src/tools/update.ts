import type { TaskRepositoryService } from "@tashks/core/repository";
import type { TaskPatch } from "@tashks/core/schema";
import * as Effect from "effect/Effect";
import type { ToolDefinition, ToolResult } from "../types.js";
import { toolError } from "../errors.js";

export interface UpdateParams {
	id: string;
	title?: string;
	status?: string;
	priority?: number;
	description?: string;
	assignee?: string;
	type?: string;
	tags?: string[];
	blocked_by?: string[];
	estimated_minutes?: number;
	close_reason?: string;
	claim?: boolean;
}

async function execute(params: UpdateParams, repo: TaskRepositoryService): Promise<ToolResult> {
	try {
		const patch: TaskPatch = {
			...(params.claim && { assignee: params.assignee ?? "agent", status: "in_progress" as const }),
			...(params.title && { title: params.title }),
			...(params.status && !params.claim && { status: params.status }),
			...(params.priority != null && { priority: params.priority }),
			...(params.description != null && { description: params.description }),
			...(params.assignee && !params.claim && { assignee: params.assignee }),
			...(params.type && { type: params.type }),
			...(params.tags && { tags: params.tags }),
			...(params.blocked_by && { blocked_by: params.blocked_by }),
			...(params.estimated_minutes != null && { estimated_minutes: params.estimated_minutes }),
			...(params.close_reason != null && { close_reason: params.close_reason }),
		};
		const task = await Effect.runPromise(repo.updateTask(params.id, patch));
		return { text: JSON.stringify(task, null, 2), data: task };
	} catch (e) {
		return toolError(e);
	}
}

export const update: ToolDefinition<UpdateParams> = {
	name: "tashks_update",
	description: "Update an existing task",
	parameters: {
		type: "object",
		properties: {
			id: { type: "string", description: "Task ID to update" },
			title: { type: "string", description: "New title" },
			status: { type: "string", description: "New status (active, done, deferred, dropped)" },
			priority: { type: "number", description: "Priority (0-4)" },
			description: { type: "string", description: "New description" },
			assignee: { type: "string", description: "Assignee" },
			type: { type: "string", description: "Task type" },
			tags: { type: "array", items: { type: "string" }, description: "Replace tags" },
			blocked_by: { type: "array", items: { type: "string" }, description: "Replace blocked_by list" },
			estimated_minutes: { type: "number", description: "Time estimate in minutes" },
			close_reason: { type: "string", description: "Reason for closing" },
			claim: { type: "boolean", description: "Atomically claim (set assignee + in_progress)" },
		},
		required: ["id"],
	},
	execute,
};
