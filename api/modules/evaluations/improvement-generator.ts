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
		`次のギャップが検出されています: ${gap.title}。`,
		`理由: ${gap.rationale}`,
		`影響する評価軸: ${gap.affectedDimensions.join("、")}。`,
		"このギャップを閉じる最小の変更を実装し、その後に検証コマンドを実行してください。",
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
					"ギャップが最小かつレビューしやすい変更で解消されている。",
					"次回評価で改善を検出できるように、根拠が追加または更新されている。",
					"検証コマンドが成功している、または失敗理由が記録されている。",
				],
				verificationCommands: verificationForGap(gap),
				createdAt: new Date().toISOString(),
			}),
		);
}
