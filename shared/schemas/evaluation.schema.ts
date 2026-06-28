import { z } from "zod";
import { evaluationDimensionKeySchema } from "./project.schema";

export const defaultBaselinePrompt =
	"このプロジェクトの価値について評価をしてください、できるだけ多角的に評点してください";

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

export const sourceInspectionCheckIdSchema = z.enum([
	"entrypoint-flow",
	"domain-logic",
	"data-persistence",
	"external-boundary",
	"verification-signal",
	"agent-output-contract",
]);
export type SourceInspectionCheckId = z.infer<
	typeof sourceInspectionCheckIdSchema
>;

export const sourceFileRoleSchema = z.enum([
	"entrypoint",
	"interface-boundary",
	"core-logic",
	"data-model",
	"external-boundary",
	"test-signal",
]);
export type SourceFileRole = z.infer<typeof sourceFileRoleSchema>;

export const sourceInspectionCheckSchema = z.object({
	id: sourceInspectionCheckIdSchema,
	title: z.string().min(1),
	objective: z.string().min(1),
	requiredRoles: z.array(sourceFileRoleSchema).min(1),
});
export type SourceInspectionCheck = z.infer<typeof sourceInspectionCheckSchema>;

export const judgeProviderSchema = z.enum([
	"codex",
	"openai",
	"azure-openai",
	"local-llm",
]);
export type JudgeProvider = z.infer<typeof judgeProviderSchema>;

export const providerRuntimeStatusSchema = z.enum([
	"ready",
	"configured",
	"not-configured",
	"adapter-not-implemented",
]);
export type ProviderRuntimeStatus = z.infer<typeof providerRuntimeStatusSchema>;

export const codexModeSchema = z.enum([
	"review-only",
	"improvement-request",
	"reevaluation",
]);
export type CodexMode = z.infer<typeof codexModeSchema>;

export const judgeSettingsSchema = z.object({
	provider: judgeProviderSchema,
	model: z.string().optional(),
	endpoint: z.string().optional(),
	apiKeyRef: z.string().optional(),
	codexMode: codexModeSchema.optional(),
	status: providerRuntimeStatusSchema,
});
export type JudgeSettings = z.infer<typeof judgeSettingsSchema>;

export const evaluationDimensionSchema = z.object({
	key: evaluationDimensionKeySchema,
	label: z.string().min(1),
});
export type EvaluationDimension = z.infer<typeof evaluationDimensionSchema>;

export const evaluationComparisonInputSchema = z.object({
	evaluationId: z.string().uuid(),
	overallScore: z.number().min(0).max(100),
	confidence: z.number().min(0).max(1),
	dimensions: z.array(
		z.object({
			key: evaluationDimensionKeySchema,
			score: z.number().min(0).max(100),
		}),
	),
	weaknesses: z.array(z.string()),
	createdAt: z.string().datetime(),
});
export type EvaluationComparisonInput = z.infer<
	typeof evaluationComparisonInputSchema
>;

export const evaluationPromptContextSchema = z.object({
	schemaVersion: z.literal("evaluation-prompt-context/v1"),
	baselinePrompt: z.string().min(1),
	projectName: z.string().min(1),
	projectRoot: z.string().min(1),
	projectIdeal: z.string().optional(),
	primaryAudience: z.string().optional(),
	targetWorkflow: z.string().optional(),
	nonGoals: z.array(z.string()),
	dimensions: z.array(evaluationDimensionSchema).min(1),
	judgeSettings: judgeSettingsSchema,
	previousEvaluation: evaluationComparisonInputSchema.optional(),
	inputs: z.object({
		readme: z.string().optional(),
		llmContext: z.string().optional(),
		agents: z.string().optional(),
		packageJson: z.unknown().optional(),
		repoTree: z.array(z.string()),
		scripts: z.record(z.string(), z.string()),
	}),
});
export type EvaluationPromptContext = z.infer<
	typeof evaluationPromptContextSchema
>;

export const sourceFileEvidenceSchema = z.object({
	path: z.string().min(1),
	role: sourceFileRoleSchema,
	checkIds: z.array(sourceInspectionCheckIdSchema).min(1),
	reason: z.string().min(1),
	content: z.string(),
	truncated: z.boolean(),
});
export type SourceFileEvidence = z.infer<typeof sourceFileEvidenceSchema>;

export const sourceInspectionResultSchema = z.object({
	checkId: sourceInspectionCheckIdSchema,
	title: z.string().min(1),
	status: z.enum(["passed", "partial", "failed", "not-inspected"]),
	files: z.array(z.string()),
	findings: z.array(z.string()),
	evidenceRefs: z.array(z.string()),
});
export type SourceInspectionResult = z.infer<
	typeof sourceInspectionResultSchema
>;

export const verificationRunSchema = z.object({
	name: z.string().min(1),
	command: z.array(z.string().min(1)).min(1),
	status: z.enum(["passed", "failed", "timed-out", "skipped"]),
	exitCode: z.number().int().nullable(),
	durationMs: z.number().int().nonnegative(),
	stdout: z.string(),
	stderr: z.string(),
});
export type VerificationRun = z.infer<typeof verificationRunSchema>;

export const evaluationBundleSchema = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	evidenceLevel: evidenceLevelSchema,
	projectRoot: z.string(),
	inputs: z.object({
		promptContext: evaluationPromptContextSchema.optional(),
		readme: z.string().optional(),
		llmContext: z.string().optional(),
		agents: z.string().optional(),
		packageJson: z.unknown().optional(),
		repoTree: z.array(z.string()),
		scripts: z.record(z.string(), z.string()),
		sourceInspectionPlan: z.array(sourceInspectionCheckSchema).default([]),
		sourceFiles: z.array(sourceFileEvidenceSchema).default([]),
		verificationRuns: z.array(verificationRunSchema).default([]),
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
	priority: z.number().int().min(1),
	taskType: improvementTaskTypeSchema,
	prompt: z.string().min(1),
	acceptanceCriteria: z.array(z.string().min(1)).min(1),
	verificationCommands: z.array(z.string().min(1)).min(1),
	createdAt: z.string().datetime(),
});
export type ImprovementRequest = z.infer<typeof improvementRequestSchema>;

export const focusedImprovementIdeaSchema = z.object({
	title: z.string().min(1),
	targetDimensions: z.array(evaluationDimensionKeySchema).min(1),
	summary: z.string().min(1),
	detailedPlan: z.string().min(1),
	implementationSteps: z.array(z.string().min(1)).min(1),
	filesToInspect: z.array(z.string().min(1)),
	acceptanceCriteria: z.array(z.string().min(1)).min(1),
	verificationCommands: z.array(z.string().min(1)).min(1),
	expectedImpact: z.string().min(1),
	risks: z.array(z.string().min(1)),
});
export type FocusedImprovementIdea = z.infer<
	typeof focusedImprovementIdeaSchema
>;

export const focusedImprovementIdeasResultSchema = z.object({
	schemaVersion: z.literal("focused-improvement-ideas/v1"),
	ideas: z.array(focusedImprovementIdeaSchema).min(1),
});
export type FocusedImprovementIdeasResult = z.infer<
	typeof focusedImprovementIdeasResultSchema
>;

export const improvementIdeaSchema = z.object({
	title: z.string().min(1),
	reason: z.string().min(1),
	expectedScoreImpact: z.number().min(0).max(100),
	affectedDimensions: z.array(evaluationDimensionKeySchema).min(1),
	suggestedPrompt: z.string().min(1),
	acceptanceCriteria: z.array(z.string().min(1)).min(1),
});
export type ImprovementIdea = z.infer<typeof improvementIdeaSchema>;

export const projectEvaluationReportSchema = z.object({
	schemaVersion: z.literal("project-evaluation-report/v1"),
	baselinePrompt: z.string().min(1),
	judge: z.object({
		provider: judgeProviderSchema,
		model: z.string().optional(),
		mode: z.string().optional(),
	}),
	overallScore: z.number().min(0).max(100),
	confidence: z.number().min(0).max(1),
	summary: z.string().min(1),
	dimensions: z
		.array(
			z.object({
				key: evaluationDimensionKeySchema,
				label: z.string().min(1),
				score: z.number().min(0).max(100),
				confidence: z.number().min(0).max(1),
				rationale: z.string().min(1),
				evidence: z.array(z.string()),
				concerns: z.array(z.string()),
			}),
		)
		.min(1),
	strengths: z.array(z.string()),
	weaknesses: z.array(z.string()),
});
export type ProjectEvaluationReport = z.infer<
	typeof projectEvaluationReportSchema
>;

export const evaluationDeltaSchema = z.object({
	previousEvaluationId: z.string().uuid(),
	scoreDelta: z.number(),
	confidenceDelta: z.number(),
	dimensionDeltas: z.array(
		z.object({
			key: evaluationDimensionKeySchema,
			previousScore: z.number().min(0).max(100),
			currentScore: z.number().min(0).max(100),
			delta: z.number(),
		}),
	),
	newWeaknesses: z.array(z.string()),
	resolvedWeaknesses: z.array(z.string()),
});
export type EvaluationDelta = z.infer<typeof evaluationDeltaSchema>;

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
	sourceInspections: z.array(sourceInspectionResultSchema).default([]),
	notVerified: z.array(z.string()),
	nextEvidenceToCollect: z.array(z.string()),
	previousScore: z.number().min(0).max(100).optional(),
	scoreDelta: z.number().optional(),
	previousConfidence: z.number().min(0).max(1).optional(),
	confidenceDelta: z.number().optional(),
	baselinePrompt: z.string().min(1).optional(),
	judgeSettings: judgeSettingsSchema.optional(),
	report: projectEvaluationReportSchema.optional(),
	delta: evaluationDeltaSchema.optional(),
	createdAt: z.string().datetime(),
});
export type ProjectValueEvaluation = z.infer<
	typeof projectValueEvaluationSchema
>;

export const llmProviderSchema = z.enum([
	"deterministic-fallback",
	"openai",
	"azure-openai",
	"local-llm",
]);
export type LlmProvider = z.infer<typeof llmProviderSchema>;

export const codexModelSchema = z.enum([
	"gpt-5.5",
	"gpt-5.4",
	"gpt-5.4-mini",
	"gpt-5.3-codex-spark",
]);
export type CodexModel = z.infer<typeof codexModelSchema>;

export const judgeSelectionSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("llm-provider"),
		provider: llmProviderSchema,
		model: z.string().optional(),
		endpoint: z.string().optional(),
		apiKeyRef: z.string().optional(),
		fallbackPolicy: z.enum(["none", "deterministic-only"]),
	}),
	z.object({
		type: z.literal("codex-agent"),
		model: codexModelSchema,
		mode: codexModeSchema,
	}),
]);
export type JudgeSelection = z.infer<typeof judgeSelectionSchema>;

export const judgeRunSchema = z.object({
	judge: z.enum(["deterministic-fallback", "codex-agent"]),
	status: z.enum(["completed"]),
	model: z.string().optional(),
	mode: codexModeSchema.optional(),
	threadId: z.string().nullable().optional(),
	usage: z.unknown().optional(),
	reason: z.string().optional(),
});
export type JudgeRun = z.infer<typeof judgeRunSchema>;

export const evaluationActivityEventSchema = z.object({
	id: z.string().uuid(),
	seq: z.number().int().nonnegative(),
	phase: z.string().min(1),
	level: z.enum(["debug", "info", "warning", "error", "checkpoint"]),
	source: z.string().min(1),
	message: z.string().min(1),
	status: z.string().optional(),
	payload: z.unknown().optional(),
	createdAt: z.string().datetime(),
});
export type EvaluationActivityEvent = z.infer<
	typeof evaluationActivityEventSchema
>;

export const createEvaluationRequestSchema = z.object({
	projectRoot: z.string().trim().min(1).optional(),
	baselinePrompt: z.string().trim().min(1).optional(),
	judge: judgeSelectionSchema.optional(),
});
export type CreateEvaluationRequest = z.infer<
	typeof createEvaluationRequestSchema
>;

export const evaluationResponseSchema = z.object({
	bundle: evaluationBundleSchema,
	evaluation: projectValueEvaluationSchema,
	improvements: z.array(improvementRequestSchema),
	judgeRun: judgeRunSchema,
	report: projectEvaluationReportSchema.optional(),
	delta: evaluationDeltaSchema.optional(),
	activityEvents: z.array(evaluationActivityEventSchema).default([]),
});
export type EvaluationResponse = z.infer<typeof evaluationResponseSchema>;

export const generateFocusedImprovementIdeasRequestSchema = z.object({
	dimensionKeys: z.array(evaluationDimensionKeySchema).min(1),
	judge: judgeSelectionSchema.optional(),
});
export type GenerateFocusedImprovementIdeasRequest = z.infer<
	typeof generateFocusedImprovementIdeasRequestSchema
>;

export const generateFocusedImprovementIdeasResponseSchema = z.object({
	ideas: z.array(focusedImprovementIdeaSchema),
	judgeRun: judgeRunSchema,
	selectedDimensionKeys: z.array(evaluationDimensionKeySchema),
});
export type GenerateFocusedImprovementIdeasResponse = z.infer<
	typeof generateFocusedImprovementIdeasResponseSchema
>;
