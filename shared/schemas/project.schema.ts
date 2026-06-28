import { z } from "zod";

export const evaluationDimensionKeySchema = z.enum([
	"conceptValue",
	"implementationCompleteness",
	"architectureQuality",
	"uiUx",
	"testability",
	"operability",
	"security",
	"maintainability",
	"extensibility",
	"ossProductValue",
	"strategicFit",
	"documentation",
	"agentUsability",
	"reliability",
]);
export type EvaluationDimensionKey = z.infer<
	typeof evaluationDimensionKeySchema
>;

export const defaultEvaluationDimensions = [
	"conceptValue",
	"implementationCompleteness",
	"architectureQuality",
	"uiUx",
	"testability",
	"operability",
	"security",
	"maintainability",
	"extensibility",
	"ossProductValue",
	"strategicFit",
] as const satisfies EvaluationDimensionKey[];

export const evaluationDimensionLabels: Record<EvaluationDimensionKey, string> =
	{
		conceptValue: "Concept Value",
		implementationCompleteness: "Implementation Completeness",
		architectureQuality: "Architecture",
		uiUx: "UI / UX",
		testability: "Testability",
		operability: "Operability",
		security: "Security",
		maintainability: "Maintainability",
		extensibility: "Extensibility",
		ossProductValue: "OSS / External Value",
		strategicFit: "Strategic Fit",
		documentation: "Documentation",
		agentUsability: "Agent Usability",
		reliability: "Reliability",
	};

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
