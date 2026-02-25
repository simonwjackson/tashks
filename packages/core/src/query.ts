import type { Task } from "./schema.js";

export const isBlocked = (task: Task, allTasks: Task[]): boolean => {
	if (task.blocked_by.length === 0) {
		return false;
	}

	const taskById = new Map(
		allTasks.map((candidate) => [candidate.id, candidate]),
	);

	return task.blocked_by.some((blockerId) => {
		const blocker = taskById.get(blockerId);
		return blocker !== undefined && blocker.status !== "done";
	});
};

export const isUnblocked = (task: Task, allTasks: Task[]): boolean =>
	!isBlocked(task, allTasks);

// TODO: Filter predicates — isDueBefore, isDueThisWeek, isDeferred
// TODO: Energy/context filters — hasEnergy, hasTag, hasProject
// TODO: Staleness detection — isStalerThan
// TODO: Completion queries — wasCompletedOn, wasCompletedBetween
// TODO: Sort helpers — byDueAsc, byEnergyAsc, byCreatedAsc, byUpdatedDescThenTitle
// TODO: Perspective loader — read perspectives.yaml and apply filters/sorts
