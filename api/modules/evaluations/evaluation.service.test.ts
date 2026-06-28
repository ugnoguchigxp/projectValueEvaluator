import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	type FocusedImprovementIdea,
	improvementRequestSchema,
	type EvaluationActivityEvent,
	type EvaluationBundle,
	type ImprovementRequest,
	type ProjectValueEvaluation,
} from "../../../shared/schemas/evaluation.schema";
import {
	defaultEvaluationDimensions,
	type ProjectProfile,
	type EvaluationDimensionKey,
} from "../../../shared/schemas/project.schema";
import { buildEvaluationBundle } from "./bundle-builder";
import {
	EvaluationService,
	type GenerateFocusedImprovementIdeasFn,
	type JudgeProjectValueFn,
} from "./evaluation.service";

function createLlmEvaluation(params: {
	project: ProjectProfile;
	bundle: EvaluationBundle;
	previousEvaluation?: ProjectValueEvaluation | null;
	score?: number;
	confidence?: number;
}): ProjectValueEvaluation {
	const score = params.score ?? 82;
	const confidence = params.confidence ?? 0.74;
	const previousScore = params.previousEvaluation?.score;
	const previousConfidence = params.previousEvaluation?.overallConfidence;
	const dimensions = params.project.dimensions.map((key) => ({
		key,
		score,
		confidence,
		rationale: `LLM returned rationale for ${key}.`,
		evidenceRefs: params.bundle.inputs.sourceFiles
			.slice(0, 1)
			.map((file) => file.path),
		caveats: [],
	}));
	return {
		id: randomUUID(),
		projectId: params.project.id,
		bundleId: params.bundle.id,
		score,
		idealScore: 100,
		overallConfidence: confidence,
		evidenceLevel: params.bundle.evidenceLevel,
		summary: "LLM returned project value evaluation.",
		dimensions,
		strengths: ["LLM returned strength."],
		gapsTo100: [
			{
				id: randomUUID(),
				title: "LLM returned gap.",
				kind: "implementation-gap",
				affectedDimensions: [
					(params.project.dimensions[0] ??
						"implementationCompleteness") as EvaluationDimensionKey,
				],
				currentEvidenceLevel: params.bundle.evidenceLevel,
				expectedScoreGain: 8,
				expectedConfidenceGain: 0.1,
				rationale: "LLM returned gap rationale.",
			},
		],
		sourceInspections: params.bundle.inputs.sourceInspectionPlan.map((check) => ({
			checkId: check.id,
			title: check.title,
			status: "partial",
			files: params.bundle.inputs.sourceFiles
				.filter((file) => file.checkIds.includes(check.id))
				.map((file) => file.path),
			findings: ["LLM returned source inspection finding."],
			evidenceRefs: params.bundle.inputs.sourceFiles
				.filter((file) => file.checkIds.includes(check.id))
				.map((file) => file.path),
		})),
		notVerified: params.bundle.notVerified,
		nextEvidenceToCollect: ["LLM returned next evidence."],
		previousScore,
		scoreDelta: previousScore === undefined ? undefined : score - previousScore,
		previousConfidence,
		confidenceDelta:
			previousConfidence === undefined
				? undefined
				: Number((confidence - previousConfidence).toFixed(3)),
		createdAt: new Date().toISOString(),
	};
}

describe("evaluation MVP pipeline", () => {
	it("uses the current multi-angle score dimensions by default", () => {
		expect(defaultEvaluationDimensions).toEqual([
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
		]);
		expect(defaultEvaluationDimensions).not.toContain("documentation");
		expect(defaultEvaluationDimensions).not.toContain("agentUsability");
		expect(defaultEvaluationDimensions).not.toContain("reliability");
	});

	it("does not cap improvement priority at five", () => {
		const parsed = improvementRequestSchema.parse({
			id: randomUUID(),
			evaluationId: randomUUID(),
			title: "Prioritized by judge",
			reason: "The judge can emit more than five ordered tasks.",
			sourceGapIds: [randomUUID()],
			sourceDimensionKeys: ["implementationCompleteness"],
			expectedScoreGain: 1,
			expectedConfidenceGain: 0.1,
			complexity: 3,
			priority: 12,
			taskType: "feature",
			prompt: "Implement the prioritized task.",
			acceptanceCriteria: ["The task is complete."],
			verificationCommands: ["bun run verify"],
			createdAt: new Date().toISOString(),
		});

		expect(parsed.priority).toBe(12);
	});

	it("builds target-specific prompt context without source inspection", async () => {
		const projectRoot = await mkdtemp(
			path.join(os.tmpdir(), "todo-evaluator-test-"),
		);
		await writeFile(
			path.join(projectRoot, "README.md"),
			"# Todo List\n\nCreate, complete, and organize todo items.",
		);
		await writeFile(
			path.join(projectRoot, "package.json"),
			JSON.stringify(
				{
					name: "todo-list",
					scripts: {
						test: "vitest run",
					},
				},
				null,
				2,
			),
		);
		await mkdir(path.join(projectRoot, "src"), { recursive: true });
		await writeFile(
			path.join(projectRoot, "src/todo.service.ts"),
			"export function addTodo(title: string) { return { title, done: false }; }\n",
		);

		const now = new Date().toISOString();
		const project: ProjectProfile = {
			id: randomUUID(),
			name: "Todo List",
			rootPath: projectRoot,
			ideal:
				"Users can create, complete, filter, and persist todo items reliably.",
			primaryAudience: "people managing personal tasks",
			targetWorkflow: "manage todo items from creation through completion",
			nonGoals: ["ProjectValueEvaluator feature parity"],
			dimensions: [...defaultEvaluationDimensions],
			createdAt: now,
			updatedAt: now,
		};

		const bundle = await buildEvaluationBundle({ project });

		expect(bundle.inputs.promptContext).toMatchObject({
			schemaVersion: "evaluation-prompt-context/v1",
			projectName: "Todo List",
			projectRoot,
			projectIdeal: project.ideal,
			targetWorkflow: project.targetWorkflow,
			judgeSettings: {
				provider: "codex",
				status: "ready",
			},
		});
		expect(bundle.inputs.promptContext?.baselinePrompt).toContain(
			"多角的に評点",
		);
		expect(bundle.inputs.promptContext?.inputs.repoTree).toContain(
			"src/todo.service.ts",
		);
		expect(bundle.inputs.sourceInspectionPlan).toEqual([]);
		expect(bundle.inputs.sourceFiles).toEqual([]);
		expect(bundle.inspectedInputs.sourceFilesSampled).toEqual([]);
	});

	it("does not let a legacy ProjectValueEvaluator ideal redefine another target project", async () => {
		const projectRoot = await mkdtemp(path.join(os.tmpdir(), "todolist-test-"));
		await writeFile(
			path.join(projectRoot, "README.md"),
			"# Todo List\n\nCreate and complete todo items.",
		);
		await writeFile(
			path.join(projectRoot, "package.json"),
			JSON.stringify({ name: "todolist" }, null, 2),
		);
		const now = new Date().toISOString();
		const project: ProjectProfile = {
			id: randomUUID(),
			name: "todolist",
			rootPath: projectRoot,
			ideal:
				"ProjectValueEvaluator が、プロジェクトの現在価値を評価し、不足点を改善依頼へ変換できる状態。",
			primaryAudience: "todo users",
			targetWorkflow: "manage todo items",
			nonGoals: [],
			dimensions: [...defaultEvaluationDimensions],
			createdAt: now,
			updatedAt: now,
		};

		const bundle = await buildEvaluationBundle({ project });

		expect(bundle.inputs.promptContext?.projectName).toBe("todolist");
		expect(bundle.inputs.promptContext?.projectRoot).toBe(projectRoot);
		expect(bundle.inputs.promptContext?.projectIdeal).toBeUndefined();
	});

	it("creates a bundle, evaluation, and re-evaluation delta", async () => {
		const projectRoot = await mkdtemp(
			path.join(os.tmpdir(), "project-evaluator-test-"),
		);
		await writeFile(
			path.join(projectRoot, "README.md"),
			"# Sample Project\n\nThis project demonstrates agent-friendly evaluation.",
		);
		await writeFile(
			path.join(projectRoot, "LLM_CONTEXT.md"),
			"# LLM Context\n\nUse bun run verify before completion.",
		);
		await writeFile(
			path.join(projectRoot, "package.json"),
			JSON.stringify(
				{
					name: `sample-${randomUUID()}`,
					scripts: {
						dev: "bun run dev",
						test: "vitest run",
						typecheck: "tsc --noEmit",
						build: "vite build",
						verify: "bun run typecheck && bun run test && bun run build",
					},
				},
				null,
				2,
			),
		);
		await mkdir(path.join(projectRoot, "api/modules/evaluations"), {
			recursive: true,
		});
		await writeFile(
			path.join(projectRoot, "api/modules/evaluations/evaluation.service.ts"),
			"export function evaluateProjectValue() { return { score: 80, gaps: [] }; }\n",
		);
		await writeFile(
			path.join(projectRoot, "api/modules/evaluations/evaluation.repository.ts"),
			"export function saveEvaluation() { return true; }\n",
		);
		await writeFile(
			path.join(projectRoot, "api/modules/evaluations/evaluation.service.test.ts"),
			"import { test } from 'vitest';\ntest('evaluation flow', () => {});\n",
		);

		const now = new Date().toISOString();
		const project: ProjectProfile = {
			id: randomUUID(),
			name: "sample",
			rootPath: projectRoot,
			ideal:
				"An agent-friendly project with clear docs, verification, and improvement handoff.",
			primaryAudience: "coding agents",
			targetWorkflow: "evaluate and improve",
			nonGoals: [],
			dimensions: [...defaultEvaluationDimensions],
			createdAt: now,
			updatedAt: now,
		};

		const firstBundle = await buildEvaluationBundle({ project });
		const firstEvaluation = createLlmEvaluation({
			project,
			bundle: firstBundle,
		});

		expect(firstEvaluation.score).toBe(82);
		expect(firstEvaluation.summary).toBe("LLM returned project value evaluation.");
		expect(firstBundle.inspectedInputs.readme).toBe(true);
		expect(firstBundle.evidenceLevel).toBe("repo-structure");
		expect(firstBundle.inputs.verificationRuns).toEqual([]);
		expect(firstBundle.inputs.sourceInspectionPlan).toEqual([]);
		expect(firstBundle.inputs.sourceFiles).toEqual([]);
		expect(firstBundle.inspectedInputs.testsExecuted).toBe(false);
		expect(firstBundle.inspectedInputs.buildExecuted).toBe(false);
		expect(firstEvaluation.sourceInspections).toEqual([]);

		const secondBundle = await buildEvaluationBundle({
			project,
			previousEvaluation: firstEvaluation,
		});
		const secondEvaluation = createLlmEvaluation({
			project,
			bundle: secondBundle,
			previousEvaluation: firstEvaluation,
		});

		expect(secondEvaluation.previousScore).toBe(firstEvaluation.score);
		expect(secondEvaluation.scoreDelta).toBe(0);
		expect(secondEvaluation.previousConfidence).toBe(
			firstEvaluation.overallConfidence,
		);
		expect(secondEvaluation.confidenceDelta).toBe(0);
	});

	it("persists and returns streamed activity events", async () => {
		const projectRoot = await mkdtemp(
			path.join(os.tmpdir(), "project-evaluator-activity-test-"),
		);
		await writeFile(
			path.join(projectRoot, "README.md"),
			"# Activity Test\n\nA project used to verify evaluation activity.",
		);
		await writeFile(
			path.join(projectRoot, "package.json"),
			JSON.stringify(
				{
					name: "activity-test",
					scripts: {
						test: "vitest run",
					},
				},
				null,
				2,
			),
		);

		const now = new Date().toISOString();
		const project: ProjectProfile = {
			id: randomUUID(),
			name: "activity-test",
			rootPath: projectRoot,
			ideal: "Evaluation activity remains visible after completion.",
			primaryAudience: "coding agents",
			targetWorkflow: "evaluate and inspect activity",
			nonGoals: [],
			dimensions: [...defaultEvaluationDimensions],
			createdAt: now,
			updatedAt: now,
		};
		const persistedCompleteEvents: unknown[] = [];
		const judgeProjectValue: JudgeProjectValueFn = async (params) => ({
			evaluation: createLlmEvaluation({
				project: params.project,
				bundle: params.bundle,
				previousEvaluation: params.previousEvaluation,
			}),
			rawOutput: {
				judge: "test-llm",
				summary: "LLM returned project value evaluation.",
			},
			judgeRun: {
				judge: "codex-agent",
				status: "completed",
				model: "test-model",
			},
		});
		const evaluationService = new EvaluationService(
			{
				get: async () => project,
			} as never,
			{
				findLatestEvaluation: async () => null,
				createEvaluationRun: async (params: {
					bundle: EvaluationBundle;
					evaluation: ProjectValueEvaluation;
					improvements: ImprovementRequest[];
					activityEvents?: EvaluationActivityEvent[];
				}) => ({
					bundle: params.bundle,
					evaluation: params.evaluation,
					improvements: params.improvements,
					activityEvents: params.activityEvents ?? [],
				}),
				createActivityEvents: async (
					_evaluationId: string,
					activityEvents: EvaluationActivityEvent[],
				) => {
					persistedCompleteEvents.push(...activityEvents);
					return activityEvents;
				},
			} as never,
			judgeProjectValue,
		);
		const streamedEvents: unknown[] = [];

		const result = await evaluationService.evaluateProject({
			projectId: project.id,
			projectRoot,
			judge: { type: "codex-agent", model: "gpt-5.5", mode: "review-only" },
			emitActivity: (event) => {
				streamedEvents.push(event);
			},
		});

		expect(result.evaluation.summary).toBe(
			"LLM returned project value evaluation.",
		);
		expect(result.activityEvents.length).toBeGreaterThan(0);
		expect(result.activityEvents).toEqual(streamedEvents);
		expect(result.activityEvents.map((event) => event.seq)).toEqual(
			result.activityEvents.map((_, index) => index),
		);
		expect(result.activityEvents.at(-1)).toMatchObject({
			phase: "complete",
			source: "evaluator",
		});
		expect(persistedCompleteEvents).toEqual([result.activityEvents.at(-1)]);
	});

	it("generates focused improvement ideas from saved evaluation context", async () => {
		const projectRoot = await mkdtemp(
			path.join(os.tmpdir(), "project-evaluator-focused-test-"),
		);
		await writeFile(
			path.join(projectRoot, "README.md"),
			"# Focused Test\n\nA project used to verify focused improvements.",
		);
		await writeFile(
			path.join(projectRoot, "package.json"),
			JSON.stringify({ name: "focused-test" }, null, 2),
		);
		const now = new Date().toISOString();
		const project: ProjectProfile = {
			id: randomUUID(),
			name: "focused-test",
			rootPath: projectRoot,
			ideal: "Focused improvements can be generated from saved context.",
			primaryAudience: "coding agents",
			targetWorkflow: "evaluate and improve selected dimensions",
			nonGoals: [],
			dimensions: [...defaultEvaluationDimensions],
			createdAt: now,
			updatedAt: now,
		};
		const bundle = await buildEvaluationBundle({ project });
		const evaluation = createLlmEvaluation({ project, bundle });
		const ideas: FocusedImprovementIdea[] = [
			{
				title: "UI 操作を改善する",
				targetDimensions: ["uiUx"],
				summary: "選択した UI/UX 軸だけに集中します。",
				detailedPlan: "評価結果下部に次アクションを置きます。",
				implementationSteps: ["ボタンを追加する", "改善案カードを表示する"],
				filesToInspect: ["web/src/views/home-view.tsx"],
				acceptanceCriteria: ["選択軸だけが対象になる"],
				verificationCommands: ["bun run verify"],
				expectedImpact: "UI/UX の改善余地が明確になります。",
				risks: [],
			},
		];
		const generateFocusedIdeas: GenerateFocusedImprovementIdeasFn = async (
			params,
		) => {
			expect(params.bundle.inputs.promptContext?.projectName).toBe(
				project.name,
			);
			expect(params.evaluation.id).toBe(evaluation.id);
			expect(params.dimensionKeys).toEqual(["uiUx"]);
			return {
				ideas,
				rawOutput: { ok: true },
				judgeRun: {
					judge: "codex-agent",
					status: "completed",
					model: "test-model",
				},
			};
		};
		const service = new EvaluationService(
			{
				get: async () => project,
			} as never,
			{
				findEvaluationById: async () => evaluation,
				findBundleById: async () => bundle,
			} as never,
			async () => {
				throw new Error("not used");
			},
			generateFocusedIdeas,
		);

		const result = await service.generateFocusedImprovementIdeas({
			evaluationId: evaluation.id,
			dimensionKeys: ["uiUx", "documentation"],
			judge: {
				type: "codex-agent",
				model: "gpt-5.5",
				mode: "improvement-request",
			},
		});

		expect(result.ideas).toEqual(ideas);
		expect(result.selectedDimensionKeys).toEqual(["uiUx"]);
	});
});
