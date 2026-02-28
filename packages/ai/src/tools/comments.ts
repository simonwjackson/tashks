import type { TaskRepositoryService } from "@tashks/core/repository";
import * as Effect from "effect/Effect";
import type { ToolDefinition, ToolResult } from "../types.js";

export interface CommentsParams {
	action: "list" | "add";
	id: string;
	text?: string;
	author?: string;
}

async function execute(params: CommentsParams, repo: TaskRepositoryService): Promise<ToolResult> {
	try {
		if (params.action === "add") {
			if (!params.text) return { text: "Error: text required for add" };
			const task = await Effect.runPromise(repo.getTask(params.id));
			const comments = [
				...task.comments,
				{ text: params.text, author: params.author ?? "agent", created: new Date().toISOString() },
			];
			const updated = await Effect.runPromise(repo.updateTask(params.id, { comments }));
			return { text: JSON.stringify(updated.comments, null, 2), data: updated.comments };
		}
		const task = await Effect.runPromise(repo.getTask(params.id));
		return { text: JSON.stringify(task.comments, null, 2), data: task.comments };
	} catch (e) {
		return { text: `Error: ${String(e)}` };
	}
}

export const comments: ToolDefinition<CommentsParams> = {
	name: "tashks_comments",
	description: "List or add comments on a task",
	parameters: {
		type: "object",
		properties: {
			action: { type: "string", enum: ["list", "add"], description: "Comment action" },
			id: { type: "string", description: "Task ID" },
			text: { type: "string", description: "Comment text (for add)" },
			author: { type: "string", description: "Comment author (default: agent)" },
		},
		required: ["action", "id"],
	},
	execute,
};
