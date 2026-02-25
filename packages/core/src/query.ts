import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import {
	TaskArea as TaskAreaSchema,
	TaskEnergy as TaskEnergySchema,
	TaskStatus as TaskStatusSchema,
	type Task,
	type TaskEnergy,
} from "./schema.js";

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

const perspectiveConfigFilePath = (dataDir: string): string =>
	join(dataDir, "perspectives.yaml");

const toErrorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const relativeDaysPattern = /^\+(\d+)d$/;

const currentIsoDate = (): string => new Date().toISOString().slice(0, 10);

const isIsoDate = (value: string): boolean => {
	if (!isoDatePattern.test(value)) {
		return false;
	}

	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) {
		return false;
	}

	return parsed.toISOString().slice(0, 10) === value;
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

const byUpdatedAscThenTitle = (a: Task, b: Task): number => {
	const byUpdatedAsc = a.updated.localeCompare(b.updated);
	if (byUpdatedAsc !== 0) {
		return byUpdatedAsc;
	}

	return a.title.localeCompare(b.title);
};

const byCompletedAtDescThenTitle = (a: Task, b: Task): number => {
	if (a.completed_at === null && b.completed_at === null) {
		return a.title.localeCompare(b.title);
	}

	if (a.completed_at === null) {
		return 1;
	}

	if (b.completed_at === null) {
		return -1;
	}

	const byCompletedAtDesc = b.completed_at.localeCompare(a.completed_at);
	if (byCompletedAtDesc !== 0) {
		return byCompletedAtDesc;
	}

	return a.title.localeCompare(b.title);
};

export const resolveRelativeDate = (
	value: string,
	today: string,
): string | null => {
	const normalized = value.trim();

	if (isIsoDate(normalized)) {
		return normalized;
	}

	if (!isIsoDate(today)) {
		return null;
	}

	if (normalized === "today") {
		return today;
	}

	const relativeMatch = relativeDaysPattern.exec(normalized);
	if (relativeMatch === null) {
		return null;
	}

	const days = Number.parseInt(relativeMatch[1], 10);
	return addDays(today, days);
};

export const PerspectiveFilters = Schema.Struct({
	status: Schema.optionalWith(TaskStatusSchema, { exact: true }),
	area: Schema.optionalWith(TaskAreaSchema, { exact: true }),
	project: Schema.optionalWith(Schema.String, { exact: true }),
	tags: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
	due_before: Schema.optionalWith(Schema.String, { exact: true }),
	due_after: Schema.optionalWith(Schema.String, { exact: true }),
	unblocked_only: Schema.optionalWith(Schema.Boolean, { exact: true }),
	energy: Schema.optionalWith(TaskEnergySchema, { exact: true }),
	stale_days: Schema.optionalWith(Schema.Number, { exact: true }),
	completed_on: Schema.optionalWith(Schema.String, { exact: true }),
});
export type PerspectiveFilters = Schema.Schema.Type<typeof PerspectiveFilters>;

export const PerspectiveSort = Schema.String;
export type PerspectiveSort = Schema.Schema.Type<typeof PerspectiveSort>;

export const Perspective = Schema.Struct({
	filters: PerspectiveFilters,
	sort: Schema.optionalWith(PerspectiveSort, { exact: true }),
});
export type Perspective = Schema.Schema.Type<typeof Perspective>;

export const PerspectiveConfig = Schema.Record({
	key: Schema.String,
	value: Perspective,
});
export type PerspectiveConfig = Schema.Schema.Type<typeof PerspectiveConfig>;

const decodePerspectiveConfigEither =
	Schema.decodeUnknownEither(PerspectiveConfig);

export const parsePerspectiveConfig = (
	record: unknown,
): PerspectiveConfig | null => {
	const result = decodePerspectiveConfigEither(record);
	return Either.isRight(result) ? result.right : null;
};

export const resolvePerspectiveConfigRelativeDates = (
	config: PerspectiveConfig,
	today: string,
): PerspectiveConfig | null => {
	const resolved: Record<string, Perspective> = {};

	for (const [name, perspective] of Object.entries(config)) {
		const dueBefore =
			perspective.filters.due_before === undefined
				? undefined
				: resolveRelativeDate(perspective.filters.due_before, today);
		const dueAfter =
			perspective.filters.due_after === undefined
				? undefined
				: resolveRelativeDate(perspective.filters.due_after, today);
		const completedOn =
			perspective.filters.completed_on === undefined
				? undefined
				: resolveRelativeDate(perspective.filters.completed_on, today);

		if (dueBefore === null || dueAfter === null || completedOn === null) {
			return null;
		}

		resolved[name] = {
			...perspective,
			filters: {
				...perspective.filters,
				...(dueBefore !== undefined ? { due_before: dueBefore } : {}),
				...(dueAfter !== undefined ? { due_after: dueAfter } : {}),
				...(completedOn !== undefined ? { completed_on: completedOn } : {}),
			},
		};
	}

	return resolved;
};

export const applyPerspectiveToTasks = (
	tasks: ReadonlyArray<Task>,
	perspective: Perspective,
	today: string = currentIsoDate(),
): Array<Task> => {
	const taskList = Array.from(tasks);
	const dueBeforePredicate =
		perspective.filters.due_before !== undefined
			? isDueBefore(perspective.filters.due_before)
			: null;
	const stalePredicate =
		perspective.filters.stale_days !== undefined
			? isStalerThan(perspective.filters.stale_days, today)
			: null;
	const completedOnPredicate =
		perspective.filters.completed_on !== undefined
			? wasCompletedOn(perspective.filters.completed_on)
			: null;

	const filtered = taskList.filter((task) => {
		if (
			perspective.filters.status !== undefined &&
			task.status !== perspective.filters.status
		) {
			return false;
		}

		if (
			perspective.filters.area !== undefined &&
			task.area !== perspective.filters.area
		) {
			return false;
		}

		if (
			perspective.filters.project !== undefined &&
			task.project !== perspective.filters.project
		) {
			return false;
		}

		if (
			perspective.filters.tags !== undefined &&
			perspective.filters.tags.length > 0 &&
			!perspective.filters.tags.some((tag) => task.tags.includes(tag))
		) {
			return false;
		}

		if (
			perspective.filters.energy !== undefined &&
			task.energy !== perspective.filters.energy
		) {
			return false;
		}

		if (dueBeforePredicate !== null && !dueBeforePredicate(task)) {
			return false;
		}

		if (
			perspective.filters.due_after !== undefined &&
			(task.due === null || task.due < perspective.filters.due_after)
		) {
			return false;
		}

		if (
			perspective.filters.unblocked_only === true &&
			!isUnblocked(task, taskList)
		) {
			return false;
		}

		if (stalePredicate !== null && !stalePredicate(task)) {
			return false;
		}

		if (completedOnPredicate !== null && !completedOnPredicate(task)) {
			return false;
		}

		return true;
	});

	switch (perspective.sort) {
		case "due_asc":
			return filtered.sort((a, b) => {
				const byDue = byDueAsc(a, b);
				return byDue !== 0 ? byDue : byUpdatedDescThenTitle(a, b);
			});
		case "energy_asc":
			return filtered.sort((a, b) => {
				const byEnergy = byEnergyAsc(a, b);
				return byEnergy !== 0 ? byEnergy : byUpdatedDescThenTitle(a, b);
			});
		case "created_asc":
			return filtered.sort((a, b) => {
				const byCreated = byCreatedAsc(a, b);
				return byCreated !== 0 ? byCreated : a.title.localeCompare(b.title);
			});
		case "updated_asc":
			return filtered.sort(byUpdatedAscThenTitle);
		case "completed_at_desc":
			return filtered.sort(byCompletedAtDescThenTitle);
		case "updated_desc":
		default:
			return filtered.sort(byUpdatedDescThenTitle);
	}
};

export const loadPerspectiveConfig = (
	dataDir: string,
	today: string = currentIsoDate(),
): Effect.Effect<PerspectiveConfig, string> =>
	Effect.tryPromise({
		try: async () => {
			const path = perspectiveConfigFilePath(dataDir);
			const source = await readFile(path, "utf8").catch((error: unknown) => {
				if (
					error !== null &&
					typeof error === "object" &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return null;
				}
				throw error;
			});

			if (source === null || source.trim().length === 0) {
				return {};
			}

			const parsed = YAML.parse(source);
			const config = parsePerspectiveConfig(parsed);
			if (config === null) {
				throw new Error(`Invalid perspective config in ${path}`);
			}

			const resolved = resolvePerspectiveConfigRelativeDates(config, today);
			if (resolved === null) {
				throw new Error(`Invalid perspective config in ${path}`);
			}

			return resolved;
		},
		catch: (error) =>
			`Perspective config loader failed: ${toErrorMessage(error)}`,
	});
