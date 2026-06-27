import type {
	EvaluationBundle,
	EvaluationResponse,
	ProjectValueEvaluation,
} from "../../../shared/schemas/evaluation.schema";
import type { ProjectService } from "../projects/project.service";
import { judgeProjectValue } from "../llm/judge-client";
import { buildEvaluationBundle } from "./bundle-builder";
import type { EvaluationRepository } from "./evaluation.repository";
import { generateImprovementRequests } from "./improvement-generator";
import { HttpError } from "../auth/errors";

export class EvaluationService {
	constructor(
		private readonly projects: ProjectService,
		private readonly evaluations: EvaluationRepository,
	) {}

	async evaluateProject(params: {
		projectId: string;
		projectRoot?: string;
	}): Promise<EvaluationResponse> {
		const project = await this.projects.get(params.projectId);
		const previousEvaluation = await this.evaluations.findLatestEvaluation(
			project.id,
		);
		const bundle = await buildEvaluationBundle({
			project,
			projectRoot: params.projectRoot,
			previousEvaluation,
		});
		const judged = await judgeProjectValue({
			project,
			bundle,
			previousEvaluation,
		});
		return this.evaluations.createEvaluationRun({
			bundle,
			evaluation: judged.evaluation,
			rawOutput: judged.rawOutput,
			improvements: generateImprovementRequests(judged.evaluation),
		});
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

	async getEvaluation(evaluationId: string): Promise<ProjectValueEvaluation> {
		const evaluation = await this.evaluations.findEvaluationById(evaluationId);
		if (!evaluation) {
			throw new HttpError(404, "Evaluation not found.");
		}
		return evaluation;
	}

	async getImprovements(evaluationId: string) {
		const evaluation = await this.evaluations.findEvaluationById(evaluationId);
		if (!evaluation) {
			throw new HttpError(404, "Evaluation not found.");
		}
		return this.evaluations.findImprovementsByEvaluationId(evaluationId);
	}
}
