import { randomBytes } from "node:crypto";
import * as Schema from "effect/Schema";
import {
	Task as TaskSchema,
	TaskCreateInput as TaskCreateInputSchema,
	type Task,
	type TaskCreateInput,
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
const decodeTaskCreateInput = Schema.decodeUnknownSync(TaskCreateInputSchema);

export const generateTaskId = (title: string): string =>
	`${slugifyTitle(title)}-${randomIdSuffix()}`;

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const createTaskFromInput = (input: TaskCreateInput): Task => {
	const normalizedInput = decodeTaskCreateInput(input);

	return decodeTask({
		...normalizedInput,
		id: generateTaskId(normalizedInput.title),
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
