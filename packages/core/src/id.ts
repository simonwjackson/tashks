import { randomBytes } from "node:crypto";

const idSuffixAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
const idSuffixLength = 6;

const maxSlugLength = 30;

const slugifyTitle = (title: string): string => {
	const slug = title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	const base = slug.length > 0 ? slug : "task";
	return base.slice(0, maxSlugLength).replace(/-+$/, "");
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
