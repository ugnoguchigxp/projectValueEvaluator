import { createHash } from "node:crypto";
import type {
	ImprovementRequest,
	ProjectValueEvaluation,
	SavedFocusedImprovementIdea,
} from "../../../shared/schemas/evaluation.schema";
import {
	nightWorkersTasksExportSchema,
	type NightWorkersTask,
	type NightWorkersTasksExport,
} from "../../../shared/schemas/nightworkers-task.schema";
import type { ProjectProfile } from "../../../shared/schemas/project.schema";

function stableTaskId(parts: string[]): string {
	return createHash("sha256")
		.update(parts.join(":"))
		.digest("hex")
		.slice(0, 24);
}

export function focusedImprovementToNightWorkersTask(params: {
	project: ProjectProfile;
	evaluation: ProjectValueEvaluation;
	idea: SavedFocusedImprovementIdea;
	priority: number;
}): NightWorkersTask {
	const expectedScoreGain =
		params.idea.scoreImpacts.length === 0
			? undefined
			: Math.max(
					...params.idea.scoreImpacts.map((impact) => impact.expectedScoreGain),
				);
	return {
		id: stableTaskId([
			params.evaluation.id,
			"focused-improvement",
			params.idea.id,
		]),
		source: {
			kind: "focused-improvement",
			id: params.idea.id,
		},
		title: params.idea.title,
		cwd: params.project.rootPath,
		prompt: params.idea.agentPrompt,
		acceptanceCriteria: [
			params.idea.expectedOutcome,
			...params.idea.implementationFocus.map((focus) => `実装焦点: ${focus}`),
			"repo-native verify が成功している、または失敗理由が記録されている。",
		],
		verificationCommands: ["bun run verify"],
		priority: params.priority,
		metadata: {
			targetDimensions: params.idea.targetDimensions,
			expectedScoreGain,
		},
	};
}

export function improvementRequestToNightWorkersTask(params: {
	project: ProjectProfile;
	evaluation: ProjectValueEvaluation;
	improvement: ImprovementRequest;
	priority: number;
}): NightWorkersTask {
	return {
		id: stableTaskId([
			params.evaluation.id,
			"gap-request",
			params.improvement.id,
		]),
		source: {
			kind: "gap-request",
			id: params.improvement.id,
		},
		title: params.improvement.title,
		cwd: params.project.rootPath,
		prompt: params.improvement.prompt,
		acceptanceCriteria: params.improvement.acceptanceCriteria,
		verificationCommands: params.improvement.verificationCommands,
		priority: params.priority,
		metadata: {
			targetDimensions: params.improvement.sourceDimensionKeys,
			expectedScoreGain: params.improvement.expectedScoreGain,
		},
	};
}

export function createNightWorkersTasksExport(params: {
	project: ProjectProfile;
	evaluation: ProjectValueEvaluation;
	tasks: NightWorkersTask[];
}): NightWorkersTasksExport {
	return nightWorkersTasksExportSchema.parse({
		schemaVersion: "project-evaluator.nightworkers-tasks/v1",
		project: {
			id: params.project.id,
			rootPath: params.project.rootPath,
			name: params.project.name,
		},
		evaluation: {
			id: params.evaluation.id,
			score: params.evaluation.score,
			createdAt: params.evaluation.createdAt,
		},
		tasks: params.tasks,
	});
}
