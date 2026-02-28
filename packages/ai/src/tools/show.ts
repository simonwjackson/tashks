import type { TaskRepositoryService } from "@tashks/core/repository";
import * as Effect from "effect/Effect";
import type { ToolDefinition, ToolResult } from "../types.js";

export interface ShowParams {
	id: string;
}

async function execute(params: ShowParams, repo: TaskRepositoryService): Promise<ToolResult> {
	try {
		const task = await Effect.runPromise(repo.getTask(params.id));
		return { text: JSON.stringify(task, null, 2), data: task };
	} catch (e) {
		return { text: `Error: ${String(e)}` };
	}
}

export const show: ToolDefinition<ShowParams> = {
	name: "tashks_show",
	description: "Show full details of a task including description, dependencies, and comments",
	parameters: {
		type: "object",
		properties: {
			id: { type: "string", description: "Task ID" },
		},
		required: ["id"],
	},
	execute,
};
