import { z } from "zod";
import { evaluationDimensionKeySchema } from "./project.schema";

export const evidenceLevelSchema = z.enum([
	"surface",
	"repo-structure",
	"code-sampled",
	"runtime-verified",
	"audit-grade",
]);
export type EvidenceLevel = z.infer<typeof evidenceLevelSchema>;

export const gapKindSchema = z.enum([
	"value-gap",
	"evidence-gap",
	"implementation-gap",
	"runtime-gap",
	"documentation-gap",
]);
export type GapKind = z.infer<typeof gapKindSchema>;

export const inspectedInputsSchema = z.object({
	readme: z.boolean(),
	llmContext: z.boolean(),
	agents: z.boolean(),
	packageJson: z.boolean(),
	repoTree: z.boolean(),
	sourceFilesSampled: z.array(z.string()),
	testsExecuted: z.boolean(),
	buildExecuted: z.boolean(),
	appLaunched: z.boolean(),
	sampleOutputReviewed: z.boolean(),
});
export type InspectedInputs = z.infer<typeof inspectedInputsSchema>;

export const evaluationBundleSchema = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	evidenceLevel: evidenceLevelSchema,
	projectRoot: z.string(),
	inputs: z.object({
		readme: z.string().optional(),
		llmContext: z.string().optional(),
		agents: z.string().optional(),
		packageJson: z.unknown().optional(),
		repoTree: z.array(z.string()),
		scripts: z.record(z.string(), z.string()),
		previousEvaluation: z.unknown().optional(),
	}),
	inspectedInputs: inspectedInputsSchema,
	missingInputs: z.array(z.string()),
	notVerified: z.array(z.string()),
	createdAt: z.string().datetime(),
});
export type EvaluationBundle = z.infer<typeof evaluationBundleSchema>;

export const dimensionScoreSchema = z.object({
	key: evaluationDimensionKeySchema,
	score: z.number().min(0).max(100),
	confidence: z.number().min(0).max(1),
	rationale: z.string().min(1),
	evidenceRefs: z.array(z.string()),
	caveats: z.array(z.string()),
});
export type DimensionScore = z.infer<typeof dimensionScoreSchema>;

export const gapSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1),
	kind: gapKindSchema,
	affectedDimensions: z.array(evaluationDimensionKeySchema),
	currentEvidenceLevel: evidenceLevelSchema,
	expectedScoreGain: z.number().min(0).max(100),
	expectedConfidenceGain: z.number().min(0).max(1),
	rationale: z.string().min(1),
});
export type Gap = z.infer<typeof gapSchema>;

export const improvementTaskTypeSchema = z.enum([
	"docs",
	"test",
	"feature",
	"refactor",
	"security",
	"agent-usability",
	"evidence",
]);
export type ImprovementTaskType = z.infer<typeof improvementTaskTypeSchema>;

export const improvementRequestSchema = z.object({
	id: z.string().uuid(),
	evaluationId: z.string().uuid(),
	title: z.string().min(1),
	reason: z.string().min(1),
	sourceGapIds: z.array(z.string().uuid()),
	sourceDimensionKeys: z.array(evaluationDimensionKeySchema),
	expectedScoreGain: z.number().min(0).max(100),
	expectedConfidenceGain: z.number().min(0).max(1),
	complexity: z.number().int().min(1).max(5),
	priority: z.number().int().min(1).max(5),
	taskType: improvementTaskTypeSchema,
	prompt: z.string().min(1),
	acceptanceCriteria: z.array(z.string().min(1)).min(1),
	verificationCommands: z.array(z.string().min(1)).min(1),
	createdAt: z.string().datetime(),
});
export type ImprovementRequest = z.infer<typeof improvementRequestSchema>;

export const projectValueEvaluationSchema = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	bundleId: z.string().uuid(),
	score: z.number().min(0).max(100),
	idealScore: z.literal(100),
	overallConfidence: z.number().min(0).max(1),
	evidenceLevel: evidenceLevelSchema,
	summary: z.string().min(1),
	dimensions: z.array(dimensionScoreSchema).min(1),
	strengths: z.array(z.string()),
	gapsTo100: z.array(gapSchema),
	notVerified: z.array(z.string()),
	nextEvidenceToCollect: z.array(z.string()),
	previousScore: z.number().min(0).max(100).optional(),
	scoreDelta: z.number().optional(),
	previousConfidence: z.number().min(0).max(1).optional(),
	confidenceDelta: z.number().optional(),
	createdAt: z.string().datetime(),
});
export type ProjectValueEvaluation = z.infer<
	typeof projectValueEvaluationSchema
>;

export const createEvaluationRequestSchema = z.object({
	projectRoot: z.string().trim().min(1).optional(),
});
export type CreateEvaluationRequest = z.infer<
	typeof createEvaluationRequestSchema
>;

export const evaluationResponseSchema = z.object({
	bundle: evaluationBundleSchema,
	evaluation: projectValueEvaluationSchema,
	improvements: z.array(improvementRequestSchema),
});
export type EvaluationResponse = z.infer<typeof evaluationResponseSchema>;
