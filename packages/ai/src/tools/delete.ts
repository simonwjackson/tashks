import type { TaskRepositoryService } from "@tashks/core/repository";
import * as Effect from "effect/Effect";
import type { ToolDefinition, ToolResult } from "../types.js";
import { toolError } from "../errors.js";

export interface DeleteParams {
	id: string;
}

async function execute(params: DeleteParams, repo: TaskRepositoryService): Promise<ToolResult> {
	try {
		await Effect.runPromise(repo.deleteTask(params.id));
		return { text: `Deleted task ${params.id}`, data: { deleted: true, id: params.id } };
	} catch (e) {
		return toolError(e);
	}
}

export const deleteTool: ToolDefinition<DeleteParams> = {
	name: "tashks_delete",
	description: "Delete a task permanently",
	parameters: {
		type: "object",
		properties: {
			id: { type: "string", description: "Task ID to delete" },
		},
		required: ["id"],
	},
	execute,
};
