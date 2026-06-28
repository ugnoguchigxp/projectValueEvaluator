import { asc, desc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
	evaluationActivityEventSchema,
	evaluationBundleSchema,
	improvementRequestSchema,
	projectValueEvaluationSchema,
	type EvaluationActivityEvent,
	type EvaluationBundle,
	type ImprovementRequest,
	type ProjectValueEvaluation,
} from "../../../shared/schemas/evaluation.schema";
import {
	evaluationActivityEvents,
	evaluationBundles,
	improvementRequests,
	projectEvaluations,
} from "../../db/schema";
import type * as schema from "../../db/schema";
import {
	confidenceToStored,
	ratioDeltaToStored,
	storedToConfidence,
	storedToRatioDelta,
} from "./score-utils";

const parseJson = <T>(value: string): T => JSON.parse(value) as T;
const toIso = (value: Date): string => value.toISOString();

function toEvaluationBundle(
	row: typeof evaluationBundles.$inferSelect,
): EvaluationBundle {
	return evaluationBundleSchema.parse({
		id: row.id,
		projectId: row.projectId,
		evidenceLevel: row.evidenceLevel,
		projectRoot: row.projectRoot,
		inputs: parseJson(row.inputsJson),
		inspectedInputs: parseJson(row.inspectedInputsJson),
		missingInputs: parseJson(row.missingInputsJson),
		notVerified: parseJson(row.notVerifiedJson),
		createdAt: toIso(row.createdAt),
	});
}

function toProjectValueEvaluation(
	row: typeof projectEvaluations.$inferSelect,
): ProjectValueEvaluation {
	const previousConfidence =
		row.previousConfidence === null
			? undefined
			: storedToConfidence(row.previousConfidence);
	return projectValueEvaluationSchema.parse({
		id: row.id,
		projectId: row.projectId,
		bundleId: row.bundleId,
		score: row.score,
		idealScore: row.idealScore,
		overallConfidence: storedToConfidence(row.overallConfidence),
		evidenceLevel: row.evidenceLevel,
		summary: row.summary,
		dimensions: parseJson(row.dimensionsJson),
		strengths: parseJson(row.strengthsJson),
		gapsTo100: parseJson(row.gapsTo100Json),
		sourceInspections: parseJson(row.sourceInspectionsJson),
		notVerified: parseJson(row.notVerifiedJson),
		nextEvidenceToCollect: parseJson(row.nextEvidenceToCollectJson),
		previousScore: row.previousScore ?? undefined,
		scoreDelta: row.scoreDelta ?? undefined,
		previousConfidence,
		confidenceDelta:
			row.confidenceDelta === null
				? undefined
				: storedToRatioDelta(row.confidenceDelta),
		baselinePrompt: row.baselinePrompt ?? undefined,
		judgeSettings:
			row.judgeSettingsJson === null
				? undefined
				: parseJson(row.judgeSettingsJson),
		report: row.reportJson === null ? undefined : parseJson(row.reportJson),
		delta: row.deltaJson === null ? undefined : parseJson(row.deltaJson),
		createdAt: toIso(row.createdAt),
	});
}

function toImprovementRequest(
	row: typeof improvementRequests.$inferSelect,
): ImprovementRequest {
	return improvementRequestSchema.parse({
		id: row.id,
		evaluationId: row.evaluationId,
		title: row.title,
		reason: row.reason,
		sourceGapIds: parseJson(row.sourceGapIdsJson),
		sourceDimensionKeys: parseJson(row.sourceDimensionKeysJson),
		expectedScoreGain: row.expectedScoreGain,
		expectedConfidenceGain: storedToConfidence(row.expectedConfidenceGain),
		complexity: row.complexity,
		priority: row.priority,
		taskType: row.taskType,
		prompt: row.prompt,
		acceptanceCriteria: parseJson(row.acceptanceCriteriaJson),
		verificationCommands: parseJson(row.verificationCommandsJson),
		createdAt: toIso(row.createdAt),
	});
}

function toEvaluationActivityEvent(
	row: typeof evaluationActivityEvents.$inferSelect,
): EvaluationActivityEvent {
	return evaluationActivityEventSchema.parse({
		id: row.id,
		seq: row.seq,
		phase: row.phase,
		level: row.level,
		source: row.source,
		message: row.message,
		status: row.status ?? undefined,
		payload:
			row.payloadJson === null
				? undefined
				: parseJson<unknown>(row.payloadJson),
		createdAt: toIso(row.createdAt),
	});
}

export class EvaluationRepository {
	constructor(private readonly db: BunSQLiteDatabase<typeof schema>) {}

	async createBundle(bundle: EvaluationBundle): Promise<EvaluationBundle> {
		const [row] = await this.db
			.insert(evaluationBundles)
			.values({
				id: bundle.id,
				projectId: bundle.projectId,
				evidenceLevel: bundle.evidenceLevel,
				projectRoot: bundle.projectRoot,
				inputsJson: JSON.stringify(bundle.inputs),
				inspectedInputsJson: JSON.stringify(bundle.inspectedInputs),
				missingInputsJson: JSON.stringify(bundle.missingInputs),
				notVerifiedJson: JSON.stringify(bundle.notVerified),
				createdAt: new Date(bundle.createdAt),
			})
			.returning();
		return toEvaluationBundle(row);
	}

	async createEvaluation(
		evaluation: ProjectValueEvaluation,
		rawOutput: unknown,
	): Promise<ProjectValueEvaluation> {
		const [row] = await this.db
			.insert(projectEvaluations)
			.values({
				id: evaluation.id,
				projectId: evaluation.projectId,
				bundleId: evaluation.bundleId,
				score: evaluation.score,
				idealScore: evaluation.idealScore,
				overallConfidence: confidenceToStored(evaluation.overallConfidence),
				evidenceLevel: evaluation.evidenceLevel,
				summary: evaluation.summary,
				dimensionsJson: JSON.stringify(evaluation.dimensions),
				strengthsJson: JSON.stringify(evaluation.strengths),
				gapsTo100Json: JSON.stringify(evaluation.gapsTo100),
				sourceInspectionsJson: JSON.stringify(evaluation.sourceInspections),
				notVerifiedJson: JSON.stringify(evaluation.notVerified),
				nextEvidenceToCollectJson: JSON.stringify(
					evaluation.nextEvidenceToCollect,
				),
				previousScore: evaluation.previousScore,
				scoreDelta: evaluation.scoreDelta,
				previousConfidence:
					evaluation.previousConfidence === undefined
						? undefined
						: confidenceToStored(evaluation.previousConfidence),
				confidenceDelta:
					evaluation.confidenceDelta === undefined
						? undefined
						: ratioDeltaToStored(evaluation.confidenceDelta),
				baselinePrompt: evaluation.baselinePrompt,
				judgeSettingsJson:
					evaluation.judgeSettings === undefined
						? undefined
						: JSON.stringify(evaluation.judgeSettings),
				reportJson:
					evaluation.report === undefined
						? undefined
						: JSON.stringify(evaluation.report),
				deltaJson:
					evaluation.delta === undefined
						? undefined
						: JSON.stringify(evaluation.delta),
				rawOutputJson: JSON.stringify(rawOutput),
				createdAt: new Date(evaluation.createdAt),
			})
			.returning();
		return toProjectValueEvaluation(row);
	}

	async createImprovements(
		improvements: ImprovementRequest[],
	): Promise<ImprovementRequest[]> {
		if (improvements.length === 0) return [];
		const rows = await this.db
			.insert(improvementRequests)
			.values(
				improvements.map((improvement) => ({
					id: improvement.id,
					evaluationId: improvement.evaluationId,
					title: improvement.title,
					reason: improvement.reason,
					sourceGapIdsJson: JSON.stringify(improvement.sourceGapIds),
					sourceDimensionKeysJson: JSON.stringify(
						improvement.sourceDimensionKeys,
					),
					expectedScoreGain: improvement.expectedScoreGain,
					expectedConfidenceGain: confidenceToStored(
						improvement.expectedConfidenceGain,
					),
					complexity: improvement.complexity,
					priority: improvement.priority,
					taskType: improvement.taskType,
					prompt: improvement.prompt,
					acceptanceCriteriaJson: JSON.stringify(
						improvement.acceptanceCriteria,
					),
					verificationCommandsJson: JSON.stringify(
						improvement.verificationCommands,
					),
					createdAt: new Date(improvement.createdAt),
				})),
			)
			.returning();
		return rows.map(toImprovementRequest);
	}

	async createActivityEvents(
		evaluationId: string,
		activityEvents: EvaluationActivityEvent[],
	): Promise<EvaluationActivityEvent[]> {
		if (activityEvents.length === 0) return [];
		const rows = await this.db
			.insert(evaluationActivityEvents)
			.values(
				activityEvents.map((event) => ({
					id: event.id,
					evaluationId,
					seq: event.seq,
					phase: event.phase,
					level: event.level,
					source: event.source,
					message: event.message,
					status: event.status,
					payloadJson:
						event.payload === undefined ? null : JSON.stringify(event.payload),
					createdAt: new Date(event.createdAt),
				})),
			)
			.returning();
		return rows.map(toEvaluationActivityEvent);
	}

	async createEvaluationRun(params: {
		bundle: EvaluationBundle;
		evaluation: ProjectValueEvaluation;
		rawOutput: unknown;
		improvements: ImprovementRequest[];
		activityEvents?: EvaluationActivityEvent[];
	}): Promise<{
		bundle: EvaluationBundle;
		evaluation: ProjectValueEvaluation;
		improvements: ImprovementRequest[];
		activityEvents: EvaluationActivityEvent[];
	}> {
		return this.db.transaction((tx) => {
			const bundleRow = tx
				.insert(evaluationBundles)
				.values({
					id: params.bundle.id,
					projectId: params.bundle.projectId,
					evidenceLevel: params.bundle.evidenceLevel,
					projectRoot: params.bundle.projectRoot,
					inputsJson: JSON.stringify(params.bundle.inputs),
					inspectedInputsJson: JSON.stringify(params.bundle.inspectedInputs),
					missingInputsJson: JSON.stringify(params.bundle.missingInputs),
					notVerifiedJson: JSON.stringify(params.bundle.notVerified),
					createdAt: new Date(params.bundle.createdAt),
				})
				.returning()
				.get();
			const evaluationRow = tx
				.insert(projectEvaluations)
				.values({
					id: params.evaluation.id,
					projectId: params.evaluation.projectId,
					bundleId: params.evaluation.bundleId,
					score: params.evaluation.score,
					idealScore: params.evaluation.idealScore,
					overallConfidence: confidenceToStored(
						params.evaluation.overallConfidence,
					),
					evidenceLevel: params.evaluation.evidenceLevel,
					summary: params.evaluation.summary,
					dimensionsJson: JSON.stringify(params.evaluation.dimensions),
					strengthsJson: JSON.stringify(params.evaluation.strengths),
					gapsTo100Json: JSON.stringify(params.evaluation.gapsTo100),
					sourceInspectionsJson: JSON.stringify(
						params.evaluation.sourceInspections,
					),
					notVerifiedJson: JSON.stringify(params.evaluation.notVerified),
					nextEvidenceToCollectJson: JSON.stringify(
						params.evaluation.nextEvidenceToCollect,
					),
					previousScore: params.evaluation.previousScore,
					scoreDelta: params.evaluation.scoreDelta,
					previousConfidence:
						params.evaluation.previousConfidence === undefined
							? undefined
							: confidenceToStored(params.evaluation.previousConfidence),
					confidenceDelta:
						params.evaluation.confidenceDelta === undefined
							? undefined
							: ratioDeltaToStored(params.evaluation.confidenceDelta),
					baselinePrompt: params.evaluation.baselinePrompt,
					judgeSettingsJson:
						params.evaluation.judgeSettings === undefined
							? undefined
							: JSON.stringify(params.evaluation.judgeSettings),
					reportJson:
						params.evaluation.report === undefined
							? undefined
							: JSON.stringify(params.evaluation.report),
					deltaJson:
						params.evaluation.delta === undefined
							? undefined
							: JSON.stringify(params.evaluation.delta),
					rawOutputJson: JSON.stringify(params.rawOutput),
					createdAt: new Date(params.evaluation.createdAt),
				})
				.returning()
				.get();
			const improvementRows =
				params.improvements.length === 0
					? []
					: tx
							.insert(improvementRequests)
							.values(
								params.improvements.map((improvement) => ({
									id: improvement.id,
									evaluationId: improvement.evaluationId,
									title: improvement.title,
									reason: improvement.reason,
									sourceGapIdsJson: JSON.stringify(improvement.sourceGapIds),
									sourceDimensionKeysJson: JSON.stringify(
										improvement.sourceDimensionKeys,
									),
									expectedScoreGain: improvement.expectedScoreGain,
									expectedConfidenceGain: confidenceToStored(
										improvement.expectedConfidenceGain,
									),
									complexity: improvement.complexity,
									priority: improvement.priority,
									taskType: improvement.taskType,
									prompt: improvement.prompt,
									acceptanceCriteriaJson: JSON.stringify(
										improvement.acceptanceCriteria,
									),
									verificationCommandsJson: JSON.stringify(
										improvement.verificationCommands,
									),
									createdAt: new Date(improvement.createdAt),
								})),
							)
							.returning()
							.all();
			const activityRows =
				params.activityEvents?.length === 0 || !params.activityEvents
					? []
					: tx
							.insert(evaluationActivityEvents)
							.values(
								params.activityEvents.map((event) => ({
									id: event.id,
									evaluationId: params.evaluation.id,
									seq: event.seq,
									phase: event.phase,
									level: event.level,
									source: event.source,
									message: event.message,
									status: event.status,
									payloadJson:
										event.payload === undefined
											? null
											: JSON.stringify(event.payload),
									createdAt: new Date(event.createdAt),
								})),
							)
							.returning()
							.all();
			return {
				bundle: toEvaluationBundle(bundleRow),
				evaluation: toProjectValueEvaluation(evaluationRow),
				improvements: improvementRows.map(toImprovementRequest),
				activityEvents: activityRows.map(toEvaluationActivityEvent),
			};
		});
	}

	async findLatestEvaluation(
		projectId: string,
	): Promise<ProjectValueEvaluation | null> {
		const row = await this.db.query.projectEvaluations.findFirst({
			where: eq(projectEvaluations.projectId, projectId),
			orderBy: [desc(projectEvaluations.createdAt)],
		});
		return row ? toProjectValueEvaluation(row) : null;
	}

	async findEvaluationsByProjectId(
		projectId: string,
	): Promise<ProjectValueEvaluation[]> {
		const rows = await this.db.query.projectEvaluations.findMany({
			where: eq(projectEvaluations.projectId, projectId),
			orderBy: [desc(projectEvaluations.createdAt)],
		});
		return rows.map(toProjectValueEvaluation);
	}

	async findEvaluationById(
		evaluationId: string,
	): Promise<ProjectValueEvaluation | null> {
		const row = await this.db.query.projectEvaluations.findFirst({
			where: eq(projectEvaluations.id, evaluationId),
		});
		return row ? toProjectValueEvaluation(row) : null;
	}

	async findBundleById(bundleId: string): Promise<EvaluationBundle | null> {
		const row = await this.db.query.evaluationBundles.findFirst({
			where: eq(evaluationBundles.id, bundleId),
		});
		return row ? toEvaluationBundle(row) : null;
	}

	async findActivityEventsByEvaluationId(
		evaluationId: string,
	): Promise<EvaluationActivityEvent[]> {
		const rows = await this.db.query.evaluationActivityEvents.findMany({
			where: eq(evaluationActivityEvents.evaluationId, evaluationId),
			orderBy: [asc(evaluationActivityEvents.seq)],
		});
		return rows.map(toEvaluationActivityEvent);
	}

	async findImprovementsByEvaluationId(
		evaluationId: string,
	): Promise<ImprovementRequest[]> {
		const rows = await this.db.query.improvementRequests.findMany({
			where: eq(improvementRequests.evaluationId, evaluationId),
			orderBy: [asc(improvementRequests.priority)],
		});
		return rows.map(toImprovementRequest);
	}
}
