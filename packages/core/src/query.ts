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

export const loadPerspectiveConfig = (
	dataDir: string,
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

			return config;
		},
		catch: (error) =>
			`Perspective config loader failed: ${toErrorMessage(error)}`,
	});
