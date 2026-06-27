import { randomUUID } from "node:crypto";
import {
	projectValueEvaluationSchema,
	type DimensionScore,
	type EvaluationBundle,
	type Gap,
	type ProjectValueEvaluation,
} from "../../../shared/schemas/evaluation.schema";
import type {
	EvaluationDimensionKey,
	ProjectProfile,
} from "../../../shared/schemas/project.schema";
import { clampConfidence, clampScore } from "../evaluations/score-utils";

const dimensionLabels: Record<EvaluationDimensionKey, string> = {
	conceptValue: "Concept Value",
	implementationCompleteness: "Implementation Completeness",
	architectureQuality: "Architecture Quality",
	maintainability: "Maintainability",
	security: "Security",
	testability: "Testability",
	documentation: "Documentation",
	agentUsability: "Agent Usability",
	extensibility: "Extensibility",
	reliability: "Reliability",
	strategicFit: "Strategic Fit",
	ossProductValue: "OSS / Product Value",
};

const hasScript = (bundle: EvaluationBundle, script: string): boolean =>
	Object.hasOwn(bundle.inputs.scripts, script);

const treeHas = (bundle: EvaluationBundle, prefix: string): boolean =>
	bundle.inputs.repoTree.some((entry) => entry.startsWith(prefix));

const textIncludes = (
	value: string | undefined,
	patterns: string[],
): boolean => {
	const lower = value?.toLowerCase() ?? "";
	return patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
};

function dimensionScore(
	key: EvaluationDimensionKey,
	project: ProjectProfile,
	bundle: EvaluationBundle,
): DimensionScore {
	const docs = [
		bundle.inspectedInputs.readme,
		bundle.inspectedInputs.llmContext,
		bundle.inspectedInputs.agents,
	].filter(Boolean).length;
	const scripts = bundle.inputs.scripts;
	const hasTests =
		hasScript(bundle, "test") ||
		bundle.inputs.repoTree.some((p) => p.includes(".test."));
	const hasVerify = hasScript(bundle, "verify");
	const hasBuild = hasScript(bundle, "build") || hasScript(bundle, "build:web");
	const hasApi = treeHas(bundle, "api/");
	const hasShared = treeHas(bundle, "shared/");
	const hasDb = treeHas(bundle, "drizzle/") || treeHas(bundle, "api/db/");
	const hasSpec = treeHas(bundle, "spec/");
	const hasSecuritySignals =
		textIncludes(bundle.inputs.readme, ["security", "セキュリティ"]) ||
		textIncludes(bundle.inputs.llmContext, ["security", "auth", "cookie"]);
	const scriptCount = Object.keys(scripts).length;

	const baseScores: Record<EvaluationDimensionKey, number> = {
		conceptValue:
			60 + (bundle.inspectedInputs.readme ? 12 : 0) + (project.ideal ? 16 : 0),
		implementationCompleteness:
			45 +
			(hasApi ? 12 : 0) +
			(hasShared ? 8 : 0) +
			(hasDb ? 8 : 0) +
			Math.min(scriptCount, 8),
		architectureQuality:
			48 +
			(hasApi ? 10 : 0) +
			(hasShared ? 10 : 0) +
			(hasDb ? 8 : 0) +
			(hasSpec ? 8 : 0),
		maintainability:
			50 +
			Math.min(bundle.inputs.repoTree.length / 24, 12) +
			(hasVerify ? 10 : 0),
		security: 48 + (hasSecuritySignals ? 14 : 0) + (hasDb ? 6 : 0),
		testability: 45 + (hasTests ? 18 : 0) + (hasVerify ? 10 : 0),
		documentation: 42 + docs * 12 + (hasSpec ? 10 : 0),
		agentUsability:
			45 +
			(bundle.inspectedInputs.llmContext ? 16 : 0) +
			(bundle.inspectedInputs.agents ? 10 : 0) +
			(hasVerify ? 8 : 0),
		extensibility:
			50 + (hasApi ? 8 : 0) + (hasShared ? 8 : 0) + (hasSpec ? 8 : 0),
		reliability:
			45 + (hasVerify ? 12 : 0) + (hasTests ? 10 : 0) + (hasBuild ? 8 : 0),
		strategicFit:
			55 +
			(textIncludes(project.ideal, ["agent", "AI", "LLM"]) ? 12 : 0) +
			(bundle.inspectedInputs.llmContext ? 8 : 0),
		ossProductValue:
			45 +
			(bundle.inspectedInputs.readme ? 14 : 0) +
			(hasScript(bundle, "dev") ? 6 : 0) +
			(hasBuild ? 6 : 0),
	};

	const confidenceBase: Record<EvaluationDimensionKey, number> = {
		conceptValue: 0.76,
		implementationCompleteness: 0.6,
		architectureQuality: 0.62,
		maintainability: 0.58,
		security: 0.42,
		testability: 0.48,
		documentation: 0.74,
		agentUsability: 0.68,
		extensibility: 0.58,
		reliability: 0.36,
		strategicFit: 0.64,
		ossProductValue: 0.62,
	};

	const evidenceRefs = [
		bundle.inspectedInputs.readme ? "README.md" : undefined,
		bundle.inspectedInputs.llmContext ? "LLM_CONTEXT.md" : undefined,
		bundle.inspectedInputs.agents ? "AGENTS.md" : undefined,
		bundle.inspectedInputs.packageJson ? "package.json" : undefined,
		bundle.inspectedInputs.repoTree ? "repo tree" : undefined,
	].filter((value): value is string => Boolean(value));

	const caveats =
		key === "security" || key === "reliability"
			? ["Runtime behavior and implementation-level audit were not verified."]
			: ["Evaluation is based on surface and repository-structure evidence."];

	return {
		key,
		score: clampScore(baseScores[key]),
		confidence: clampConfidence(
			confidenceBase[key] + Math.min(docs * 0.025, 0.08),
		),
		rationale: `${dimensionLabels[key]} was evaluated from ${evidenceRefs.join(", ")}.`,
		evidenceRefs,
		caveats,
	};
}

function createGaps(bundle: EvaluationBundle): Gap[] {
	const gaps: Gap[] = [];
	const addGap = (gap: Omit<Gap, "id" | "currentEvidenceLevel">) => {
		gaps.push({
			id: randomUUID(),
			currentEvidenceLevel: bundle.evidenceLevel,
			...gap,
		});
	};

	if (!bundle.inspectedInputs.readme) {
		addGap({
			title: "README が評価 bundle に含まれていない",
			kind: "documentation-gap",
			affectedDimensions: ["conceptValue", "documentation", "ossProductValue"],
			expectedScoreGain: 4,
			expectedConfidenceGain: 0.08,
			rationale:
				"Project purpose and usage cannot be evaluated confidently without README.md.",
		});
	}
	if (!bundle.inspectedInputs.llmContext) {
		addGap({
			title: "LLM_CONTEXT が評価 bundle に含まれていない",
			kind: "documentation-gap",
			affectedDimensions: ["agentUsability", "architectureQuality"],
			expectedScoreGain: 3,
			expectedConfidenceGain: 0.08,
			rationale: "Agent-facing architecture and workflow context is missing.",
		});
	}
	if (!hasScript(bundle, "verify")) {
		addGap({
			title: "統合 verify コマンドが確認できない",
			kind: "evidence-gap",
			affectedDimensions: ["testability", "reliability", "agentUsability"],
			expectedScoreGain: 3,
			expectedConfidenceGain: 0.1,
			rationale:
				"Agents need a single verification gate to confirm improvements.",
		});
	}
	if (!bundle.inspectedInputs.testsExecuted) {
		addGap({
			title: "テスト実行結果が未確認",
			kind: "runtime-gap",
			affectedDimensions: ["testability", "reliability"],
			expectedScoreGain: 0,
			expectedConfidenceGain: 0.16,
			rationale:
				"Score is provisional until tests or equivalent verification commands are executed.",
		});
	}
	if (!bundle.inspectedInputs.sampleOutputReviewed) {
		addGap({
			title: "sample evaluation output が未確認",
			kind: "value-gap",
			affectedDimensions: [
				"ossProductValue",
				"agentUsability",
				"documentation",
			],
			expectedScoreGain: 4,
			expectedConfidenceGain: 0.06,
			rationale:
				"A sample output makes the value and downstream handoff easier to inspect.",
		});
	}
	return gaps;
}

function nextEvidence(bundle: EvaluationBundle): string[] {
	const items = [
		"Run typecheck, tests, and build; attach command outcomes to the next evaluation.",
		"Review the core implementation files for the evaluation pipeline.",
		"Generate and inspect a sample evaluation report.",
	];
	if (bundle.missingInputs.length > 0) {
		items.unshift(
			`Resolve missing inputs: ${bundle.missingInputs.join(", ")}.`,
		);
	}
	return items;
}

export async function judgeProjectValue(params: {
	project: ProjectProfile;
	bundle: EvaluationBundle;
	previousEvaluation?: ProjectValueEvaluation | null;
}): Promise<{ evaluation: ProjectValueEvaluation; rawOutput: unknown }> {
	const dimensions = params.project.dimensions.map((key) =>
		dimensionScore(key, params.project, params.bundle),
	);
	const score = clampScore(
		dimensions.reduce((sum, dimension) => sum + dimension.score, 0) /
			dimensions.length,
	);
	const overallConfidence = clampConfidence(
		dimensions.reduce((sum, dimension) => sum + dimension.confidence, 0) /
			dimensions.length,
	);
	const gapsTo100 = createGaps(params.bundle);
	const previousScore = params.previousEvaluation?.score;
	const previousConfidence = params.previousEvaluation?.overallConfidence;

	const evaluation = projectValueEvaluationSchema.parse({
		id: randomUUID(),
		projectId: params.project.id,
		bundleId: params.bundle.id,
		score,
		idealScore: 100,
		overallConfidence,
		evidenceLevel: params.bundle.evidenceLevel,
		summary:
			"Surface and repository-structure evidence were evaluated. Runtime and audit-grade claims remain provisional.",
		dimensions,
		strengths: [
			params.bundle.inspectedInputs.readme
				? "README is available for concept evaluation."
				: undefined,
			params.bundle.inspectedInputs.packageJson
				? "package scripts are available for workflow inference."
				: undefined,
			params.bundle.inspectedInputs.repoTree
				? "Repository structure is available for architecture inference."
				: undefined,
		].filter((value): value is string => Boolean(value)),
		gapsTo100,
		notVerified: params.bundle.notVerified,
		nextEvidenceToCollect: nextEvidence(params.bundle),
		previousScore,
		scoreDelta: previousScore === undefined ? undefined : score - previousScore,
		previousConfidence,
		confidenceDelta:
			previousConfidence === undefined
				? undefined
				: Number((overallConfidence - previousConfidence).toFixed(3)),
		createdAt: new Date().toISOString(),
	});

	return {
		evaluation,
		rawOutput: {
			judge: "deterministic-fallback",
			reason: "No external LLM judge is required for MVP verification.",
		},
	};
}
