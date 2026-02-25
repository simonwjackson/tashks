import type { Task, TaskEnergy } from "./schema.js";

const addDays = (date: string, days: number): string => {
	const next = new Date(`${date}T00:00:00.000Z`);
	next.setUTCDate(next.getUTCDate() + days);
	return next.toISOString().slice(0, 10);
};

const dateToUtcMidnight = (date: string): number => {
	const parsed = new Date(`${date}T00:00:00.000Z`).getTime();
	return Number.isNaN(parsed) ? Number.NaN : parsed;
};

const completionDate = (task: Task): string | null => {
	if (task.completed_at === null) {
		return null;
	}

	const parsed = new Date(task.completed_at);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed.toISOString().slice(0, 10);
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

export const hasEnergy =
	(level: TaskEnergy) =>
	(task: Task): boolean =>
		task.energy === level;

export const hasTag =
	(tag: string) =>
	(task: Task): boolean =>
		task.tags.includes(tag);

export const hasProject =
	(project: string) =>
	(task: Task): boolean =>
		task.project === project;

export const isStalerThan =
	(days: number, today: string) =>
	(task: Task): boolean => {
		const updated = dateToUtcMidnight(task.updated);
		const now = dateToUtcMidnight(today);

		if (Number.isNaN(updated) || Number.isNaN(now)) {
			return false;
		}

		const elapsedDays = (now - updated) / 86_400_000;
		return elapsedDays > days;
	};

export const wasCompletedOn =
	(date: string) =>
	(task: Task): boolean =>
		completionDate(task) === date;

export const wasCompletedBetween =
	(start: string, end: string) =>
	(task: Task): boolean => {
		const completed = completionDate(task);
		if (completed === null) {
			return false;
		}

		return completed >= start && completed <= end;
	};

const energyRank: Record<TaskEnergy, number> = {
	low: 0,
	medium: 1,
	high: 2,
};

export const byDueAsc = (a: Task, b: Task): number => {
	if (a.due === null && b.due === null) {
		return 0;
	}

	if (a.due === null) {
		return 1;
	}

	if (b.due === null) {
		return -1;
	}

	return a.due.localeCompare(b.due);
};

export const byEnergyAsc = (a: Task, b: Task): number =>
	energyRank[a.energy] - energyRank[b.energy];

export const byCreatedAsc = (a: Task, b: Task): number =>
	a.created.localeCompare(b.created);

export const byUpdatedDescThenTitle = (a: Task, b: Task): number => {
	const byUpdatedDesc = b.updated.localeCompare(a.updated);
	if (byUpdatedDesc !== 0) {
		return byUpdatedDesc;
	}

	return a.title.localeCompare(b.title);
};

// TODO: Perspective loader — read perspectives.yaml and apply filters/sorts
