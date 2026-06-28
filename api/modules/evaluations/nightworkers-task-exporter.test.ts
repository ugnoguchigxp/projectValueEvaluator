import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
	ImprovementRequest,
	ProjectValueEvaluation,
	SavedFocusedImprovementIdea,
} from "../../../shared/schemas/evaluation.schema";
import type { ProjectProfile } from "../../../shared/schemas/project.schema";
import {
	createNightWorkersTasksExport,
	focusedImprovementToNightWorkersTask,
	improvementRequestToNightWorkersTask,
} from "./nightworkers-task-exporter";

const now = "2026-06-28T00:00:00.000Z";

function createProject(): ProjectProfile {
	return {
		id: randomUUID(),
		name: "Target Project",
		rootPath: "/tmp/target-project",
		ideal: "The project is useful to coding agents.",
		primaryAudience: "coding agents",
		targetWorkflow: "generate useful implementation tasks",
		nonGoals: [],
		dimensions: ["testability", "operability"],
		createdAt: now,
		updatedAt: now,
	};
}

function createEvaluation(project: ProjectProfile): ProjectValueEvaluation {
	return {
		id: randomUUID(),
		projectId: project.id,
		bundleId: randomUUID(),
		score: 61,
		idealScore: 100,
		overallConfidence: 0.7,
		evidenceLevel: "repo-structure",
		summary: "The project has useful improvement opportunities.",
		dimensions: [
			{
				key: "testability",
				score: 50,
				confidence: 0.8,
				rationale: "Tests need stronger signal.",
				evidenceRefs: [],
				caveats: [],
			},
		],
		strengths: ["Clear purpose."],
		gapsTo100: [],
		sourceInspections: [],
		notVerified: [],
		nextEvidenceToCollect: [],
		createdAt: now,
	};
}

describe("NightWorkers task exporter", () => {
	it("exports a focused improvement as a stable NightWorkers task", () => {
		const project = createProject();
		const evaluation = createEvaluation(project);
		const idea: SavedFocusedImprovementIdea = {
			id: randomUUID(),
			evaluationId: evaluation.id,
			title: "Strengthen verification signal",
			targetDimensions: ["testability"],
			summary: "Make the verification signal easier for agents to trust.",
			agentPrompt: "Add a focused verification path and document how to run it.",
			implementationFocus: ["Add focused command", "Document expected output"],
			expectedOutcome: "Agents can verify the change with one command.",
			scoreImpacts: [
				{
					dimensionKey: "testability",
					currentScore: 50,
					expectedScoreGain: 8,
					expectedScoreAfter: 58,
					rationale: "A direct command improves task confidence.",
				},
			],
			createdAt: now,
		};

		const task = focusedImprovementToNightWorkersTask({
			project,
			evaluation,
			idea,
			priority: 1,
		});
		const repeated = focusedImprovementToNightWorkersTask({
			project,
			evaluation,
			idea,
			priority: 1,
		});

		expect(task.id).toBe(repeated.id);
		expect(task).toMatchObject({
			source: { kind: "focused-improvement", id: idea.id },
			title: idea.title,
			cwd: project.rootPath,
			prompt: idea.agentPrompt,
			verificationCommands: ["bun run verify"],
			priority: 1,
			metadata: {
				targetDimensions: ["testability"],
				expectedScoreGain: 8,
			},
		});
		expect(task.acceptanceCriteria).toContain(idea.expectedOutcome);
	});

	it("exports gap requests using their existing prompt and verification commands", () => {
		const project = createProject();
		const evaluation = createEvaluation(project);
		const improvement: ImprovementRequest = {
			id: randomUUID(),
			evaluationId: evaluation.id,
			title: "Add agent-facing docs",
			reason: "Agents need clearer instructions.",
			sourceGapIds: [randomUUID()],
			sourceDimensionKeys: ["operability"],
			expectedScoreGain: 6,
			expectedConfidenceGain: 0.1,
			complexity: 2,
			priority: 4,
			taskType: "docs",
			prompt: "Write an agent-facing usage note.",
			acceptanceCriteria: ["The usage note exists."],
			verificationCommands: ["bun run typecheck"],
			createdAt: now,
		};

		const task = improvementRequestToNightWorkersTask({
			project,
			evaluation,
			improvement,
			priority: 2,
		});

		expect(task).toMatchObject({
			source: { kind: "gap-request", id: improvement.id },
			title: improvement.title,
			cwd: project.rootPath,
			prompt: improvement.prompt,
			acceptanceCriteria: improvement.acceptanceCriteria,
			verificationCommands: improvement.verificationCommands,
			priority: 2,
			metadata: {
				targetDimensions: ["operability"],
				expectedScoreGain: 6,
			},
		});
	});

	it("wraps tasks in the export schema", () => {
		const project = createProject();
		const evaluation = createEvaluation(project);
		const exported = createNightWorkersTasksExport({
			project,
			evaluation,
			tasks: [],
		});

		expect(exported).toEqual({
			schemaVersion: "project-evaluator.nightworkers-tasks/v1",
			project: {
				id: project.id,
				rootPath: project.rootPath,
				name: project.name,
			},
			evaluation: {
				id: evaluation.id,
				score: evaluation.score,
				createdAt: evaluation.createdAt,
			},
			tasks: [],
		});
	});
});
