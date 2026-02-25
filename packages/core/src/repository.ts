import { randomBytes } from "node:crypto";
import * as Either from "effect/Either";
import * as Schema from "effect/Schema";
import {
	Task as TaskSchema,
	TaskCreateInput as TaskCreateInputSchema,
	TaskPatch as TaskPatchSchema,
	WorkLogEntry as WorkLogEntrySchema,
	type Task,
	type TaskCreateInput,
	type TaskPatch,
	type WorkLogEntry,
} from "./schema.js";

const idSuffixAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
const idSuffixLength = 6;

const slugifyTitle = (title: string): string => {
	const slug = title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return slug.length > 0 ? slug : "task";
};

const randomIdSuffix = (): string => {
	const random = randomBytes(idSuffixLength);
	return Array.from(
		random,
		(value) => idSuffixAlphabet[value % idSuffixAlphabet.length],
	).join("");
};

const decodeTask = Schema.decodeUnknownSync(TaskSchema);
const decodeTaskEither = Schema.decodeUnknownEither(TaskSchema);
const decodeTaskCreateInput = Schema.decodeUnknownSync(TaskCreateInputSchema);
const decodeTaskPatch = Schema.decodeUnknownSync(TaskPatchSchema);
const decodeWorkLogEntryEither = Schema.decodeUnknownEither(WorkLogEntrySchema);

export const generateTaskId = (title: string): string =>
	`${slugifyTitle(title)}-${randomIdSuffix()}`;

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const parseTaskRecord = (record: unknown): Task | null => {
	const result = decodeTaskEither(record);
	return Either.isRight(result) ? result.right : null;
};

export const parseWorkLogRecord = (record: unknown): WorkLogEntry | null => {
	const result = decodeWorkLogEntryEither(record);
	return Either.isRight(result) ? result.right : null;
};

export const createTaskFromInput = (input: TaskCreateInput): Task => {
	const normalizedInput = decodeTaskCreateInput(input);

	return decodeTask({
		...normalizedInput,
		id: generateTaskId(normalizedInput.title),
	});
};

export const applyTaskPatch = (task: Task, patch: TaskPatch): Task => {
	const normalizedTask = decodeTask(task);
	const normalizedPatch = decodeTaskPatch(patch);

	return decodeTask({
		...normalizedTask,
		...normalizedPatch,
		updated: todayIso(),
	});
};

// TODO: TaskRepository Effect service (Context.Tag)
// TODO: YAML-backed CRUD for tasks and work log entries
// TODO: listTasks, getTask, createTask, updateTask, deleteTask
// TODO: completeTask with recurrence handling
// TODO: generateNextRecurrence (replace vs accumulate)
// TODO: processDueRecurrences for clock-driven recurrence
// TODO: listStale helper
// TODO: Hook execution (on-create, on-modify, on-complete, on-delete)
