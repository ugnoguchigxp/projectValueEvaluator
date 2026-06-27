import { z } from "zod";

export const evaluationDimensionKeySchema = z.enum([
	"conceptValue",
	"implementationCompleteness",
	"architectureQuality",
	"maintainability",
	"security",
	"testability",
	"documentation",
	"agentUsability",
	"extensibility",
	"reliability",
	"strategicFit",
	"ossProductValue",
]);
export type EvaluationDimensionKey = z.infer<
	typeof evaluationDimensionKeySchema
>;

export const defaultEvaluationDimensions = [
	"conceptValue",
	"implementationCompleteness",
	"architectureQuality",
	"maintainability",
	"security",
	"testability",
	"documentation",
	"agentUsability",
	"extensibility",
	"reliability",
	"strategicFit",
	"ossProductValue",
] as const satisfies EvaluationDimensionKey[];

export const projectProfileInputSchema = z.object({
	name: z.string().trim().min(1),
	rootPath: z.string().trim().min(1),
	ideal: z.string().trim().min(1),
	primaryAudience: z.string().trim().min(1).default("coding agents"),
	targetWorkflow: z
		.string()
		.trim()
		.min(1)
		.default("evaluate project value and generate next improvements"),
	nonGoals: z.array(z.string().trim().min(1)).default([]),
	dimensions: z
		.array(evaluationDimensionKeySchema)
		.min(1)
		.default([...defaultEvaluationDimensions]),
});
export type ProjectProfileInput = z.input<typeof projectProfileInputSchema>;
export type ProjectProfileCreate = z.output<typeof projectProfileInputSchema>;

export const projectProfileSchema = projectProfileInputSchema.extend({
	id: z.string().uuid(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});
export type ProjectProfile = z.infer<typeof projectProfileSchema>;

export const projectResponseSchema = z.object({
	project: projectProfileSchema,
});
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
