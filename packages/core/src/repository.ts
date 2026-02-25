import { randomBytes } from "node:crypto";

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

export const generateTaskId = (title: string): string =>
	`${slugifyTitle(title)}-${randomIdSuffix()}`;

// TODO: TaskRepository Effect service (Context.Tag)
// TODO: YAML-backed CRUD for tasks and work log entries
// TODO: listTasks, getTask, createTask, updateTask, deleteTask
// TODO: completeTask with recurrence handling
// TODO: generateNextRecurrence (replace vs accumulate)
// TODO: processDueRecurrences for clock-driven recurrence
// TODO: listStale helper
// TODO: Hook execution (on-create, on-modify, on-complete, on-delete)
