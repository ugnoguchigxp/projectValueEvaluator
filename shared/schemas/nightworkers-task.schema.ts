import { z } from "zod";
import { evaluationDimensionKeySchema } from "./project.schema";

export const nightWorkersTaskSourceKindSchema = z.enum([
	"focused-improvement",
	"gap-request",
]);
export type NightWorkersTaskSourceKind = z.infer<
	typeof nightWorkersTaskSourceKindSchema
>;

export const nightWorkersTaskSchema = z.object({
	id: z.string().min(1),
	source: z.object({
		kind: nightWorkersTaskSourceKindSchema,
		id: z.string().uuid(),
	}),
	title: z.string().min(1),
	cwd: z.string().min(1),
	prompt: z.string().min(1),
	acceptanceCriteria: z.array(z.string().min(1)).min(1),
	verificationCommands: z.array(z.string().min(1)).min(1),
	priority: z.number().int().min(1),
	metadata: z.object({
		targetDimensions: z.array(evaluationDimensionKeySchema),
		expectedScoreGain: z.number().min(0).max(100).optional(),
	}),
});
export type NightWorkersTask = z.infer<typeof nightWorkersTaskSchema>;

export const nightWorkersTasksExportSchema = z.object({
	schemaVersion: z.literal("project-evaluator.nightworkers-tasks/v1"),
	project: z.object({
		id: z.string().uuid(),
		rootPath: z.string().min(1),
		name: z.string().min(1),
	}),
	evaluation: z.object({
		id: z.string().uuid(),
		score: z.number().min(0).max(100),
		createdAt: z.string().datetime(),
	}),
	tasks: z.array(nightWorkersTaskSchema),
});
export type NightWorkersTasksExport = z.infer<
	typeof nightWorkersTasksExportSchema
>;
