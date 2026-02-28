import type { Task } from "@tashks/core/schema";
import { isBlocked } from "@tashks/core/query";

export const STATUS_SYM: Record<string, string> = {
	active: "o",
	in_progress: ">",
	done: "*",
	deferred: "-",
	dropped: "x",
};

export function statusSym(status: string): string {
	return STATUS_SYM[status] ?? "?";
}

export function displaySym(task: Task, allTasks?: readonly Task[]): string {
	if (task.status === "active" && allTasks && isBlocked(task, allTasks as Task[])) return "x";
	if (task.status === "active" && task.blocked_by.length > 0) return "x";
	return statusSym(task.status);
}

export function fmtPriority(p: number | null | undefined): string {
	return p != null ? `P${p}` : "";
}

export function fmtTaskOneLiner(task: Task, allTasks?: readonly Task[]): string {
	const parts = [
		`[${displaySym(task, allTasks)}]`,
		fmtPriority(task.priority),
		task.id,
		task.title,
	];
	if (task.assignee) parts.push(`@${task.assignee}`);
	return parts.filter(Boolean).join(" ");
}

export function fmtTaskDetail(task: Task, allTasks?: readonly Task[]): string {
	const lines = [fmtTaskOneLiner(task, allTasks)];
	if (task.type !== "task") lines.push(`  type: ${task.type}`);
	if (task.assignee) lines.push(`  assignee: ${task.assignee}`);
	if (task.priority != null) lines.push(`  priority: ${fmtPriority(task.priority)}`);
	if (task.description) lines.push(`  ${task.description}`);
	if (task.blocked_by.length) lines.push(`  blocked_by: ${task.blocked_by.join(", ")}`);
	if (task.comments.length) lines.push(`  comments: ${task.comments.length}`);
	return lines.join("\n");
}

export function countByStatus(tasks: Task[]): string {
	const counts: Record<string, number> = {};
	for (const t of tasks) {
		counts[t.status] = (counts[t.status] ?? 0) + 1;
	}
	return Object.entries(counts)
		.map(([s, n]) => `${statusSym(s)} ${s}: ${n}`)
		.join(", ");
}
