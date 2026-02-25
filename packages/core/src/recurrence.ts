import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import pkg from "rrule";
const { Frequency, RRule, rrulestr } = pkg;
import { Task as TaskSchema, type Task } from "./schema.js";
import { generateTaskId } from "./id.js";

const decodeTask = Schema.decodeUnknownSync(TaskSchema);

const toErrorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export interface CompletionRecurrenceInterval {
	readonly frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
	readonly interval: number;
}

const completionRecurrenceFrequencies = new Map<
	typeof Frequency[keyof typeof Frequency],
	CompletionRecurrenceInterval["frequency"]
>([
	[Frequency.DAILY, "DAILY"],
	[Frequency.WEEKLY, "WEEKLY"],
	[Frequency.MONTHLY, "MONTHLY"],
	[Frequency.YEARLY, "YEARLY"],
]);

export const parseCompletionRecurrenceInterval = (
	recurrence: string,
): Effect.Effect<CompletionRecurrenceInterval, string> =>
	Effect.try({
		try: () => {
			const parsedRule = rrulestr(recurrence, { forceset: false });
			if (!(parsedRule instanceof RRule)) {
				throw new Error(
					"Unsupported completion recurrence: expected a single RRULE",
				);
			}

			const frequency = completionRecurrenceFrequencies.get(
				parsedRule.options.freq,
			);
			if (frequency === undefined) {
				const frequencyLabel =
					Frequency[parsedRule.options.freq] ?? String(parsedRule.options.freq);
				throw new Error(
					`Unsupported completion recurrence frequency: ${frequencyLabel}`,
				);
			}

			const interval = parsedRule.options.interval;
			if (!Number.isFinite(interval) || interval < 1) {
				throw new Error(`Invalid recurrence interval: ${String(interval)}`);
			}

			return { frequency, interval } as const;
		},
		catch: (error) =>
			`TaskRepository failed to parse recurrence interval: ${toErrorMessage(error)}`,
	});

export const addRecurrenceInterval = (
	date: Date,
	recurrenceInterval: CompletionRecurrenceInterval,
): Date => {
	const next = new Date(date.getTime());

	switch (recurrenceInterval.frequency) {
		case "DAILY":
			next.setUTCDate(next.getUTCDate() + recurrenceInterval.interval);
			break;
		case "WEEKLY":
			next.setUTCDate(next.getUTCDate() + recurrenceInterval.interval * 7);
			break;
		case "MONTHLY":
			next.setUTCMonth(next.getUTCMonth() + recurrenceInterval.interval);
			break;
		case "YEARLY":
			next.setUTCFullYear(next.getUTCFullYear() + recurrenceInterval.interval);
			break;
	}

	return next;
};

export const shiftIsoDateByRecurrenceInterval = (
	date: string,
	recurrenceInterval: CompletionRecurrenceInterval,
): Effect.Effect<string, string> =>
	Effect.try({
		try: () => {
			const parsed = new Date(`${date}T00:00:00.000Z`);
			if (Number.isNaN(parsed.getTime())) {
				throw new Error(`Invalid ISO date: ${date}`);
			}

			return addRecurrenceInterval(parsed, recurrenceInterval)
				.toISOString()
				.slice(0, 10);
		},
		catch: (error) =>
			`TaskRepository failed to shift ISO date: ${toErrorMessage(error)}`,
	});

export const shiftIsoDateTimeToDateByRecurrenceInterval = (
	dateTime: string,
	recurrenceInterval: CompletionRecurrenceInterval,
): Effect.Effect<string, string> =>
	Effect.try({
		try: () => {
			const parsed = new Date(dateTime);
			if (Number.isNaN(parsed.getTime())) {
				throw new Error(`Invalid ISO datetime: ${dateTime}`);
			}

			return addRecurrenceInterval(parsed, recurrenceInterval)
				.toISOString()
				.slice(0, 10);
		},
		catch: (error) =>
			`TaskRepository failed to shift ISO datetime: ${toErrorMessage(error)}`,
	});

export const toIsoDateTime = (
	value: Date,
	label: string,
): Effect.Effect<string, string> =>
	Effect.try({
		try: () => {
			const timestamp = value.getTime();
			if (Number.isNaN(timestamp)) {
				throw new Error(`Invalid ${label} datetime`);
			}
			return value.toISOString();
		},
		catch: (error) =>
			`TaskRepository failed to normalize ${label} datetime: ${toErrorMessage(error)}`,
	});

export const parseIsoDateToUtcStart = (
	value: string,
	label: string,
): Effect.Effect<Date, string> =>
	Effect.try({
		try: () => {
			const parsed = new Date(`${value}T00:00:00.000Z`);
			if (Number.isNaN(parsed.getTime())) {
				throw new Error(`Invalid ISO date: ${value}`);
			}
			return parsed;
		},
		catch: (error) =>
			`TaskRepository failed to parse ${label} date: ${toErrorMessage(error)}`,
	});

export const parseIsoDateTime = (
	value: string,
	label: string,
): Effect.Effect<Date, string> =>
	Effect.try({
		try: () => {
			const parsed = new Date(value);
			if (Number.isNaN(parsed.getTime())) {
				throw new Error(`Invalid ISO datetime: ${value}`);
			}
			return parsed;
		},
		catch: (error) =>
			`TaskRepository failed to parse ${label} datetime: ${toErrorMessage(error)}`,
	});

export const buildCompletionRecurrenceTask = (
	completedTask: Task,
	completedAt: string,
): Effect.Effect<Task | null, string> => {
	const recurrence = completedTask.recurrence;
	if (
		recurrence === null ||
		completedTask.recurrence_trigger !== "completion"
	) {
		return Effect.succeed(null);
	}

	return Effect.gen(function* () {
		const recurrenceInterval =
			yield* parseCompletionRecurrenceInterval(recurrence);
		const deferUntil = yield* shiftIsoDateTimeToDateByRecurrenceInterval(
			completedAt,
			recurrenceInterval,
		);
		const shiftedDue =
			completedTask.due === null
				? null
				: yield* shiftIsoDateByRecurrenceInterval(
						completedTask.due,
						recurrenceInterval,
					);
		const completedDate = completedAt.slice(0, 10);

		return decodeTask({
			...completedTask,
			id: generateTaskId(completedTask.title),
			status: "active",
			created: completedDate,
			updated: completedDate,
			due: shiftedDue,
			actual_minutes: null,
			completed_at: null,
			last_surfaced: null,
			defer_until: deferUntil,
			nudge_count: 0,
			recurrence_last_generated: completedAt,
		});
	});
};

export const isClockRecurrenceDue = (
	task: Task,
	now: Date,
): Effect.Effect<boolean, string> =>
	Effect.gen(function* () {
		const recurrence = task.recurrence;
		if (recurrence === null || task.recurrence_trigger !== "clock") {
			return false;
		}

		const nowIso = yield* toIsoDateTime(now, "recurrence check");
		const nowDate = new Date(nowIso);
		const createdAt = yield* parseIsoDateToUtcStart(
			task.created,
			"task created",
		);
		const lastGeneratedAt =
			task.recurrence_last_generated === null
				? createdAt
				: yield* parseIsoDateTime(
						task.recurrence_last_generated,
						"recurrence_last_generated",
					);
		const rule = yield* Effect.try({
			try: () => rrulestr(recurrence, { dtstart: createdAt, forceset: false }),
			catch: (error) =>
				`TaskRepository failed to parse recurrence for ${task.id}: ${toErrorMessage(error)}`,
		});
		const nextOccurrence = rule.after(lastGeneratedAt, false);

		return (
			nextOccurrence !== null && nextOccurrence.getTime() <= nowDate.getTime()
		);
	});

export const buildNextClockRecurrenceTask = (
	existingTask: Task,
	generatedAt: Date,
): Effect.Effect<
	{
		readonly nextTask: Task;
		readonly updatedCurrent: Task | null;
		readonly shouldReplaceCurrent: boolean;
	},
	string
> =>
	Effect.gen(function* () {
		const recurrence = existingTask.recurrence;
		if (recurrence === null) {
			return yield* Effect.fail(
				`TaskRepository failed to generate next recurrence for ${existingTask.id}: task is not recurring`,
			);
		}

		const generatedAtIso = yield* toIsoDateTime(
			generatedAt,
			"recurrence generation",
		);
		const generatedDate = generatedAtIso.slice(0, 10);
		const nextTask = decodeTask({
			...existingTask,
			id: generateTaskId(existingTask.title),
			status: "active",
			created: generatedDate,
			updated: generatedDate,
			actual_minutes: null,
			completed_at: null,
			last_surfaced: null,
			defer_until: null,
			nudge_count: 0,
			recurrence_last_generated: generatedAtIso,
		});

		let updatedCurrent: Task | null = null;
		let shouldReplaceCurrent = false;

		if (
			existingTask.recurrence_strategy === "replace" &&
			existingTask.status !== "done" &&
			existingTask.status !== "dropped"
		) {
			updatedCurrent = decodeTask({
				...existingTask,
				status: "dropped",
				updated: generatedDate,
				recurrence_last_generated: generatedAtIso,
			});
			shouldReplaceCurrent = true;
		}

		if (existingTask.recurrence_strategy === "accumulate") {
			updatedCurrent = decodeTask({
				...existingTask,
				updated: generatedDate,
				recurrence_last_generated: generatedAtIso,
			});
		}

		return { nextTask, updatedCurrent, shouldReplaceCurrent } as const;
	});
