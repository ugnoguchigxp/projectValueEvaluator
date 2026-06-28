import { randomUUID } from "node:crypto";
import type {
	EvaluationActivityEvent,
	EvaluationBundle,
	EvaluationResponse,
	FocusedImprovementIdea,
	JudgeRun,
	JudgeSelection,
	ProjectValueEvaluation,
} from "../../../shared/schemas/evaluation.schema";
import type { EvaluationDimensionKey } from "../../../shared/schemas/project.schema";
import type { ProjectService } from "../projects/project.service";
import {
	generateFocusedImprovementIdeasWithCodex,
	judgeProjectValue as defaultJudgeProjectValue,
} from "../llm/judge-client";
import { buildEvaluationBundle } from "./bundle-builder";
import type { EvaluationRepository } from "./evaluation.repository";
import { HttpError } from "../auth/errors";
import path from "node:path";

export type EvaluationActivityEmitter = (
	event: Omit<EvaluationActivityEvent, "id" | "seq" | "createdAt">,
) => Promise<void> | void;

export type EvaluationActivityObserver = (
	event: EvaluationActivityEvent,
) => Promise<void> | void;

export type JudgeProjectValueFn = (params: {
	project: Awaited<ReturnType<ProjectService["get"]>>;
	bundle: EvaluationBundle;
	previousEvaluation?: ProjectValueEvaluation | null;
	judge?: JudgeSelection;
	emitActivity?: EvaluationActivityEmitter;
}) => Promise<{
	evaluation: ProjectValueEvaluation;
	rawOutput: unknown;
	judgeRun: JudgeRun;
}>;

export type GenerateFocusedImprovementIdeasFn = (params: {
	project: Awaited<ReturnType<ProjectService["get"]>>;
	bundle: EvaluationBundle;
	evaluation: ProjectValueEvaluation;
	dimensionKeys: EvaluationDimensionKey[];
	judge?: JudgeSelection;
}) => Promise<{
	ideas: FocusedImprovementIdea[];
	rawOutput: unknown;
	judgeRun: JudgeRun;
}>;

export class EvaluationService {
	constructor(
		private readonly projects: ProjectService,
		private readonly evaluations: EvaluationRepository,
		private readonly judgeProjectValue: JudgeProjectValueFn = defaultJudgeProjectValue,
		private readonly generateFocusedIdeas: GenerateFocusedImprovementIdeasFn = generateFocusedImprovementIdeasWithCodex,
	) {}

	async evaluateProject(params: {
		projectId: string;
		projectRoot?: string;
		baselinePrompt?: string;
		judge?: JudgeSelection;
		emitActivity?: EvaluationActivityObserver;
	}): Promise<EvaluationResponse> {
		const activityEvents: EvaluationActivityEvent[] = [];
		let seq = 0;
		const emit: EvaluationActivityEmitter = async (event) => {
			const activity = {
				id: randomUUID(),
				seq: seq++,
				createdAt: new Date().toISOString(),
				...event,
			};
			activityEvents.push(activity);
			await params.emitActivity?.(activity);
		};
		await emit({
			phase: "project",
			level: "info",
			source: "evaluator",
			message: "Loading project profile.",
		});
		const project = await this.projects.get(params.projectId);
		if (
			params.projectRoot &&
			path.resolve(params.projectRoot) !== path.resolve(project.rootPath)
		) {
			throw new HttpError(
				400,
				"projectRoot override must match the selected project profile rootPath.",
			);
		}
		await emit({
			phase: "history",
			level: "info",
			source: "evaluator",
			message: "Loading previous evaluation.",
		});
		const previousEvaluation = await this.evaluations.findLatestEvaluation(
			project.id,
		);
		await emit({
			phase: "bundle",
			level: "info",
			source: "evaluator",
			message: "Building evaluation bundle and verification evidence.",
		});
		const bundle = await buildEvaluationBundle({
			project,
			projectRoot: params.projectRoot,
			previousEvaluation,
			judge: params.judge,
			baselinePrompt: params.baselinePrompt,
		});
		await emit({
			phase: "bundle",
			level: "checkpoint",
			source: "evaluator",
			message: "Prompt context ready for baseline evaluation.",
			payload: {
				evidenceLevel: bundle.evidenceLevel,
				baselinePrompt: bundle.inputs.promptContext?.baselinePrompt,
				judgeSettings: bundle.inputs.promptContext?.judgeSettings,
			},
		});
		await emit({
			phase: "judge",
			level: "info",
			source: "evaluator",
			message: "Starting judge evaluation.",
			payload: { judge: params.judge },
		});
		const judged = await this.judgeProjectValue({
			project,
			bundle,
			previousEvaluation,
			judge: params.judge,
			emitActivity: emit,
		});
		await emit({
			phase: "save",
			level: "info",
			source: "evaluator",
			message: "Saving evaluation.",
		});
		const run = await this.evaluations.createEvaluationRun({
			bundle,
			evaluation: judged.evaluation,
			rawOutput: judged.rawOutput,
			improvements: [],
			activityEvents,
		});
		const persistedActivityCount = run.activityEvents.length;
		await emit({
			phase: "complete",
			level: "checkpoint",
			source: "evaluator",
			message: `Evaluation complete: ${run.evaluation.score} / ${run.evaluation.idealScore}.`,
			payload: {
				evaluationId: run.evaluation.id,
				score: run.evaluation.score,
				confidence: run.evaluation.overallConfidence,
			},
		});
		const pendingActivityEvents = activityEvents.slice(persistedActivityCount);
		await this.evaluations.createActivityEvents(
			run.evaluation.id,
			pendingActivityEvents,
		);
		return {
			...run,
			judgeRun: judged.judgeRun,
			report: run.evaluation.report,
			delta: run.evaluation.delta,
			activityEvents,
		};
	}

	async createBundle(params: {
		projectId: string;
		projectRoot?: string;
	}): Promise<EvaluationBundle> {
		const project = await this.projects.get(params.projectId);
		const previousEvaluation = await this.evaluations.findLatestEvaluation(
			project.id,
		);
		const bundle = await buildEvaluationBundle({
			project,
			projectRoot: params.projectRoot,
			previousEvaluation,
		});
		return this.evaluations.createBundle(bundle);
	}

	async getLatestEvaluation(
		projectId: string,
	): Promise<ProjectValueEvaluation> {
		const evaluation = await this.evaluations.findLatestEvaluation(projectId);
		if (!evaluation) {
			throw new HttpError(404, "Evaluation not found.");
		}
		return evaluation;
	}

	async listProjectEvaluations(
		projectId: string,
	): Promise<ProjectValueEvaluation[]> {
		await this.projects.get(projectId);
		return this.evaluations.findEvaluationsByProjectId(projectId);
	}

	async getEvaluation(evaluationId: string): Promise<ProjectValueEvaluation> {
		const evaluation = await this.evaluations.findEvaluationById(evaluationId);
		if (!evaluation) {
			throw new HttpError(404, "Evaluation not found.");
		}
		return evaluation;
	}

	async getActivityEvents(
		evaluationId: string,
	): Promise<EvaluationActivityEvent[]> {
		const evaluation = await this.evaluations.findEvaluationById(evaluationId);
		if (!evaluation) {
			throw new HttpError(404, "Evaluation not found.");
		}
		return this.evaluations.findActivityEventsByEvaluationId(evaluationId);
	}

	async getImprovements(evaluationId: string) {
		const evaluation = await this.evaluations.findEvaluationById(evaluationId);
		if (!evaluation) {
			throw new HttpError(404, "Evaluation not found.");
		}
		return this.evaluations.findImprovementsByEvaluationId(evaluationId);
	}

	async generateFocusedImprovementIdeas(params: {
		evaluationId: string;
		dimensionKeys: EvaluationDimensionKey[];
		judge?: JudgeSelection;
	}): Promise<{
		ideas: FocusedImprovementIdea[];
		judgeRun: JudgeRun;
		selectedDimensionKeys: EvaluationDimensionKey[];
	}> {
		const evaluation = await this.evaluations.findEvaluationById(
			params.evaluationId,
		);
		if (!evaluation) {
			throw new HttpError(404, "Evaluation not found.");
		}
		const bundle = await this.evaluations.findBundleById(evaluation.bundleId);
		if (!bundle) {
			throw new HttpError(404, "Evaluation bundle not found.");
		}
		if (!bundle.inputs.promptContext) {
			throw new HttpError(
				400,
				"EvaluationPromptContext is not available for this evaluation.",
			);
		}
		const project = await this.projects.get(evaluation.projectId);
		const availableDimensionKeys = new Set(
			(evaluation.report?.dimensions ?? evaluation.dimensions).map(
				(dimension) => dimension.key,
			),
		);
		const selectedDimensionKeys = Array.from(
			new Set(params.dimensionKeys),
		).filter((key) => availableDimensionKeys.has(key));
		if (selectedDimensionKeys.length === 0) {
			throw new HttpError(
				400,
				"Select at least one dimension from the saved evaluation.",
			);
		}
		const generated = await this.generateFocusedIdeas({
			project,
			bundle,
			evaluation,
			dimensionKeys: selectedDimensionKeys,
			judge: params.judge,
		});
		return {
			ideas: generated.ideas,
			judgeRun: generated.judgeRun,
			selectedDimensionKeys,
		};
	}
}
