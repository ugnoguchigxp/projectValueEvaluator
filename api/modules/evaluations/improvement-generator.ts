import { randomUUID } from "node:crypto";
import {
	improvementRequestSchema,
	type Gap,
	type ImprovementRequest,
	type ProjectValueEvaluation,
} from "../../../shared/schemas/evaluation.schema";

function taskTypeForGap(gap: Gap): ImprovementRequest["taskType"] {
	if (gap.kind === "documentation-gap") return "docs";
	if (gap.kind === "runtime-gap" || gap.kind === "evidence-gap") {
		return "evidence";
	}
	if (gap.affectedDimensions.includes("security")) return "security";
	if (gap.affectedDimensions.includes("agentUsability")) {
		return "agent-usability";
	}
	return "feature";
}

function verificationForGap(gap: Gap): string[] {
	if (gap.kind === "documentation-gap") {
		return ["bun run typecheck", "bun run format:check"];
	}
	if (gap.kind === "runtime-gap" || gap.kind === "evidence-gap") {
		return ["bun run verify"];
	}
	return ["bun run typecheck", "bun run test"];
}

function promptForGap(gap: Gap): string {
	return [
		`ProjectValueEvaluator found this gap: ${gap.title}.`,
		`Reason: ${gap.rationale}`,
		`Affected dimensions: ${gap.affectedDimensions.join(", ")}.`,
		"Implement the smallest change that closes this gap, then run the verification commands.",
	].join("\n");
}

export function generateImprovementRequests(
	evaluation: ProjectValueEvaluation,
): ImprovementRequest[] {
	return evaluation.gapsTo100
		.slice()
		.sort((a, b) => {
			const aGain = a.expectedScoreGain + a.expectedConfidenceGain * 20;
			const bGain = b.expectedScoreGain + b.expectedConfidenceGain * 20;
			return bGain - aGain;
		})
		.slice(0, 6)
		.map((gap, index) =>
			improvementRequestSchema.parse({
				id: randomUUID(),
				evaluationId: evaluation.id,
				title: gap.title,
				reason: gap.rationale,
				sourceGapIds: [gap.id],
				sourceDimensionKeys: gap.affectedDimensions,
				expectedScoreGain: gap.expectedScoreGain,
				expectedConfidenceGain: gap.expectedConfidenceGain,
				complexity: gap.kind === "runtime-gap" ? 1 : 2,
				priority: index + 1,
				taskType: taskTypeForGap(gap),
				prompt: promptForGap(gap),
				acceptanceCriteria: [
					"The gap is addressed with a minimal, reviewable change.",
					"Evidence is added or updated so the next evaluation can detect the improvement.",
					"Verification commands complete successfully or their failure is documented.",
				],
				verificationCommands: verificationForGap(gap),
				createdAt: new Date().toISOString(),
			}),
		);
}
