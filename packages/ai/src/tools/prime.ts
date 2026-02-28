import type { TaskRepositoryService } from "@tashks/core/repository";
import { isBlocked, byPriorityAsc, byUrgencyDesc, byCreatedAsc } from "@tashks/core/query";
import * as Effect from "effect/Effect";
import type { ToolDefinition, ToolResult } from "../types.js";
import { toolError } from "../errors.js";
import { fmtTaskOneLiner } from "../format.js";

export type PrimeParams = Record<string, never>;

async function execute(_params: PrimeParams, repo: TaskRepositoryService): Promise<ToolResult> {
	try {
		const allTasks = await Effect.runPromise(repo.listTasks({}));
		const active = allTasks.filter((t) => t.status === "active");
		const blocked = active.filter((t) => isBlocked(t, allTasks));
		const ready = active.filter((t) => !isBlocked(t, allTasks));
		const deferred = allTasks.filter((t) => t.status === "deferred");
		const done = allTasks.filter((t) => t.status === "done");

		ready.sort((a, b) => byPriorityAsc(a, b) || byUrgencyDesc(a, b) || byCreatedAsc(a, b));

		const lines: string[] = [];
		lines.push("## Task Board\n");
		lines.push(`Total: ${allTasks.length} | Active: ${active.length} | Ready: ${ready.length} | Blocked: ${blocked.length} | Deferred: ${deferred.length} | Done: ${done.length}\n`);

		if (ready.length) {
			lines.push("### Ready");
			for (const t of ready) lines.push(`- ${fmtTaskOneLiner(t, allTasks)}`);
			lines.push("");
		}

		if (blocked.length) {
			lines.push("### Blocked");
			for (const t of blocked) {
				lines.push(`- ${fmtTaskOneLiner(t, allTasks)} (blocked by ${t.blocked_by.join(", ")})`);
			}
			lines.push("");
		}

		if (deferred.length) {
			lines.push("### Deferred");
			for (const t of deferred) lines.push(`- ${fmtTaskOneLiner(t, allTasks)}`);
			lines.push("");
		}

		if (done.length) {
			const recent = done
				.filter((t) => t.completed_at)
				.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
				.slice(0, 5);
			if (recent.length) {
				lines.push("### Recently Done");
				for (const t of recent) lines.push(`- ${fmtTaskOneLiner(t, allTasks)}`);
				lines.push("");
			}
		}

		const text = lines.join("\n");
		return {
			text,
			data: {
				total: allTasks.length,
				active: active.length,
				ready: ready.length,
				blocked: blocked.length,
				deferred: deferred.length,
				done: done.length,
			},
		};
	} catch (e) {
		return toolError(e);
	}
}

export const prime: ToolDefinition<PrimeParams> = {
	name: "tashks_prime",
	description: "Generate a markdown summary of the task board for AI context injection",
	parameters: {
		type: "object",
		properties: {},
		required: [],
	},
	execute,
};
