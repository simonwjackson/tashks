import type { TaskRepositoryService } from "@tashks/core/repository";
import { isBlocked } from "@tashks/core/query";
import * as Effect from "effect/Effect";
import type { ToolDefinition, ToolResult } from "../types.js";
import { toolError } from "../errors.js";

export type StatusParams = Record<string, never>;

async function execute(_params: StatusParams, repo: TaskRepositoryService): Promise<ToolResult> {
	try {
		const allTasks = await Effect.runPromise(repo.listTasks({}));
		const active = allTasks.filter((t) => t.status === "active");
		const blocked = active.filter((t) => isBlocked(t, allTasks));
		const ready = active.filter((t) => !isBlocked(t, allTasks));

		const byStatus: Record<string, number> = {};
		const byType: Record<string, number> = {};
		for (const t of allTasks) {
			byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
			byType[t.type] = (byType[t.type] ?? 0) + 1;
		}

		const data = {
			total: allTasks.length,
			by_status: byStatus,
			by_type: byType,
			ready: ready.length,
			blocked: blocked.length,
		};
		return { text: JSON.stringify(data, null, 2), data };
	} catch (e) {
		return toolError(e);
	}
}

export const status: ToolDefinition<StatusParams> = {
	name: "tashks_status",
	description: "Show task database overview: counts by status, type, ready, blocked",
	parameters: {
		type: "object",
		properties: {},
		required: [],
	},
	execute,
};
