export type ErrorCode = "NOT_FOUND" | "VALIDATION" | "IO" | "UNKNOWN";

export function classifyError(e: unknown): { code: ErrorCode; message: string } {
	const msg = String(e);
	if (/not found/i.test(msg)) return { code: "NOT_FOUND", message: msg };
	if (/required|invalid|missing|validation/i.test(msg)) return { code: "VALIDATION", message: msg };
	if (/enoent|eacces|eperm|i\/o|io error|read|write/i.test(msg)) return { code: "IO", message: msg };
	return { code: "UNKNOWN", message: msg };
}

export function toolError(e: unknown): { text: string; error: { code: ErrorCode; message: string } } {
	const error = classifyError(e);
	return { text: `Error: ${error.message}`, error };
}
