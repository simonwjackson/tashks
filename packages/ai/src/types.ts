import type { TaskRepositoryService } from "@tashks/core/repository";

export interface ToolResult {
	/** Human/LLM-readable text output */
	text: string;
	/** Structured data for programmatic consumers (optional) */
	data?: unknown;
}

export interface ToolDefinition<P = Record<string, unknown>> {
	/** Stable identifier. Convention: tashks_<verb> */
	name: string;
	/** Human-readable description for the LLM */
	description: string;
	/** JSON Schema Draft 7 for input parameters */
	parameters: Record<string, unknown>;
	/** Execute the tool against a repository instance */
	execute: (params: P, repo: TaskRepositoryService) => Promise<ToolResult>;
}
