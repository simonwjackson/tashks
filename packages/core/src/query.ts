import type { Task } from "./schema.js";

const addDays = (date: string, days: number): string => {
	const next = new Date(`${date}T00:00:00.000Z`);
	next.setUTCDate(next.getUTCDate() + days);
	return next.toISOString().slice(0, 10);
};

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

export const isDueBefore =
	(date: string) =>
	(task: Task): boolean =>
		task.due !== null && task.due <= date;

export const isDueThisWeek = (today: string) => {
	const weekEnd = addDays(today, 7);
	return (task: Task): boolean =>
		task.due !== null && task.due >= today && task.due < weekEnd;
};

export const isDeferred =
	(today: string) =>
	(task: Task): boolean =>
		task.defer_until !== null && task.defer_until > today;

// TODO: Energy/context filters — hasEnergy, hasTag, hasProject
// TODO: Staleness detection — isStalerThan
// TODO: Completion queries — wasCompletedOn, wasCompletedBetween
// TODO: Sort helpers — byDueAsc, byEnergyAsc, byCreatedAsc, byUpdatedDescThenTitle
// TODO: Perspective loader — read perspectives.yaml and apply filters/sorts
