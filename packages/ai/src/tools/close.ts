import type { TaskRepositoryService } from "@tashks/core/repository";
import * as Effect from "effect/Effect";
import type { ToolDefinition, ToolResult } from "../types.js";

export interface CloseParams {
	id: string;
	reason?: string;
}

async function execute(params: CloseParams, repo: TaskRepositoryService): Promise<ToolResult> {
	try {
		if (params.reason) {
			await Effect.runPromise(repo.updateTask(params.id, { close_reason: params.reason }));
		}
		const task = await Effect.runPromise(repo.completeTask(params.id));
		return { text: JSON.stringify(task, null, 2), data: task };
	} catch (e) {
		return { text: `Error: ${String(e)}` };
	}
}

export const close: ToolDefinition<CloseParams> = {
	name: "tashks_close",
	description: "Close a task (mark as done)",
	parameters: {
		type: "object",
		properties: {
			id: { type: "string", description: "Task ID to close" },
			reason: { type: "string", description: "Reason for closing" },
		},
		required: ["id"],
	},
	execute,
};
