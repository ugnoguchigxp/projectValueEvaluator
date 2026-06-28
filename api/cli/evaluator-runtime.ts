import { readFile } from "node:fs/promises";
import path from "node:path";
import { readAppEnv } from "../app/env";
import { createDbConnection } from "../db";
import { EvaluationRepository } from "../modules/evaluations/evaluation.repository";
import { EvaluationService } from "../modules/evaluations/evaluation.service";
import { ProjectRepository } from "../modules/projects/project.repository";
import { ProjectService } from "../modules/projects/project.service";
import {
	projectProfileInputSchema,
	type ProjectProfile,
	type ProjectProfileInput,
	type EvaluationDimensionKey,
	evaluationDimensionKeySchema,
} from "../../shared/schemas/project.schema";
import type {
	EvaluationBundle,
	EvaluationResponse,
	GenerateFocusedImprovementIdeasResponse,
	JudgeSelection,
	ProjectValueEvaluation,
} from "../../shared/schemas/evaluation.schema";
import type { NightWorkersTasksExport } from "../../shared/schemas/nightworkers-task.schema";
import { defaultCodexJudgeSelection } from "../modules/llm/judge-client";

type OutputFormat = "json" | "jsonl";
type NightWorkersTaskSource = "focused" | "gap-requests";

export type ParsedArgs = {
	project?: string;
	profile?: string;
	json: boolean;
	baselinePrompt?: string;
	judge: JudgeSelection;
};

export type FocusedImprovementArgs = ParsedArgs & {
	evaluation: string;
	dimensions: string;
};

export type NightWorkersTaskArgs = ParsedArgs & {
	evaluation: string;
	source: NightWorkersTaskSource;
	limit?: number;
	format: OutputFormat;
};

function readRequiredValue(
	argv: string[],
	index: number,
	flag: string,
): string {
	const value = argv[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`Missing value for ${flag}.`);
	}
	return value;
}

function applyCommonArg(
	parsed: ParsedArgs,
	argv: string[],
	index: number,
): number | null {
	const arg = argv[index];
	if (arg === "--json") {
		parsed.json = true;
		return index;
	}
	if (arg === "--project") {
		parsed.project = readRequiredValue(argv, index, "--project");
		return index + 1;
	}
	if (arg === "--profile") {
		parsed.profile = readRequiredValue(argv, index, "--profile");
		return index + 1;
	}
	if (arg === "--baseline-prompt") {
		parsed.baselinePrompt = readRequiredValue(argv, index, "--baseline-prompt");
		return index + 1;
	}
	if (arg === "--provider") {
		const provider = readRequiredValue(argv, index, "--provider");
		if (provider === "codex") {
			parsed.judge = {
				type: "codex-agent",
				model:
					parsed.judge.type === "codex-agent" ? parsed.judge.model : "gpt-5.5",
				mode:
					parsed.judge.type === "codex-agent"
						? parsed.judge.mode
						: "review-only",
			};
			return index + 1;
		}
		if (
			provider === "openai" ||
			provider === "azure-openai" ||
			provider === "local-llm"
		) {
			parsed.judge = {
				type: "llm-provider",
				provider,
				fallbackPolicy: "none",
			};
			return index + 1;
		}
		throw new Error(`Unsupported provider: ${provider}.`);
	}
	if (arg === "--model") {
		const model = readRequiredValue(argv, index, "--model");
		parsed.judge =
			parsed.judge.type === "codex-agent"
				? { ...parsed.judge, model: model as typeof parsed.judge.model }
				: { ...parsed.judge, model };
		return index + 1;
	}
	if (arg === "--codex-mode") {
		const mode = readRequiredValue(argv, index, "--codex-mode");
		if (
			mode !== "review-only" &&
			mode !== "improvement-request" &&
			mode !== "reevaluation"
		) {
			throw new Error(`Unsupported Codex mode: ${mode}.`);
		}
		const codexMode = mode as
			| "review-only"
			| "improvement-request"
			| "reevaluation";
		parsed.judge =
			parsed.judge.type === "codex-agent"
				? { ...parsed.judge, mode: codexMode }
				: { type: "codex-agent", model: "gpt-5.5", mode: codexMode };
		return index + 1;
	}
	return null;
}

function createDefaultArgs(): ParsedArgs {
	return {
		json: false,
		judge: defaultCodexJudgeSelection,
	};
}

function assertProjectArg(args: ParsedArgs): void {
	if (!args.project) {
		throw new Error("Missing required --project <path> argument.");
	}
}

export function parseEvaluatorArgs(argv: string[]): ParsedArgs {
	const parsed = createDefaultArgs();
	for (let index = 0; index < argv.length; index += 1) {
		const nextIndex = applyCommonArg(parsed, argv, index);
		if (nextIndex !== null) {
			index = nextIndex;
			continue;
		}
		throw new Error(`Unknown argument: ${argv[index]}`);
	}
	assertProjectArg(parsed);
	return parsed;
}

export function parseFocusedImprovementArgs(
	argv: string[],
): FocusedImprovementArgs {
	const parsed: FocusedImprovementArgs = {
		...createDefaultArgs(),
		evaluation: "latest",
		dimensions: "lowest:3",
	};
	parsed.judge = {
		type: "codex-agent",
		model: defaultCodexJudgeSelection.model,
		mode: "improvement-request",
	};
	for (let index = 0; index < argv.length; index += 1) {
		const nextIndex = applyCommonArg(parsed, argv, index);
		if (nextIndex !== null) {
			index = nextIndex;
			continue;
		}
		const arg = argv[index];
		if (arg === "--evaluation") {
			parsed.evaluation = readRequiredValue(argv, index, "--evaluation");
			index += 1;
			continue;
		}
		if (arg === "--dimensions") {
			parsed.dimensions = readRequiredValue(argv, index, "--dimensions");
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	assertProjectArg(parsed);
	return parsed;
}

export function parseNightWorkersTaskArgs(
	argv: string[],
): NightWorkersTaskArgs {
	const parsed: NightWorkersTaskArgs = {
		...createDefaultArgs(),
		evaluation: "latest",
		source: "focused",
		format: "json",
	};
	for (let index = 0; index < argv.length; index += 1) {
		const nextIndex = applyCommonArg(parsed, argv, index);
		if (nextIndex !== null) {
			index = nextIndex;
			continue;
		}
		const arg = argv[index];
		if (arg === "--evaluation") {
			parsed.evaluation = readRequiredValue(argv, index, "--evaluation");
			index += 1;
			continue;
		}
		if (arg === "--source") {
			const source = readRequiredValue(argv, index, "--source");
			if (source !== "focused" && source !== "gap-requests") {
				throw new Error(`Unsupported task source: ${source}.`);
			}
			parsed.source = source;
			index += 1;
			continue;
		}
		if (arg === "--limit") {
			const rawLimit = readRequiredValue(argv, index, "--limit");
			const limit = Number(rawLimit);
			if (!Number.isInteger(limit) || limit < 1) {
				throw new Error("--limit must be a positive integer.");
			}
			parsed.limit = limit;
			index += 1;
			continue;
		}
		if (arg === "--format") {
			const format = readRequiredValue(argv, index, "--format");
			if (format !== "json" && format !== "jsonl") {
				throw new Error(`Unsupported format: ${format}.`);
			}
			parsed.format = format;
			parsed.json = format === "json";
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	assertProjectArg(parsed);
	return parsed;
}

export async function runEvaluatorCli(fn: () => Promise<void>): Promise<void> {
	try {
		await fn();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

async function readProfileFile(
	profilePath: string,
): Promise<Partial<ProjectProfileInput>> {
	const text = await readFile(profilePath, "utf8");
	const parsed = JSON.parse(text) as unknown;
	if (!parsed || typeof parsed !== "object") {
		throw new Error("Profile file must contain a JSON object.");
	}
	return parsed;
}

export async function loadProjectInput(
	args: ParsedArgs,
): Promise<ProjectProfileInput> {
	const rootPath = path.resolve(args.project ?? ".");
	const fromFile = args.profile
		? await readProfileFile(path.resolve(args.profile))
		: {};
	const fallbackName = path.basename(rootPath);
	return projectProfileInputSchema.parse({
		name: fallbackName,
		ideal:
			"このプロジェクトが、対象ユーザーに明確な価値を提供し、実装・検証・文書・agent usability が揃った状態。",
		...fromFile,
		rootPath,
	});
}

export async function withEvaluatorServices<T>(
	fn: (services: {
		projectService: ProjectService;
		evaluationService: EvaluationService;
	}) => Promise<T>,
): Promise<T> {
	const env = readAppEnv();
	const connection = createDbConnection(env.databaseUrl);
	try {
		const projectService = new ProjectService(
			new ProjectRepository(connection.db),
		);
		const evaluationService = new EvaluationService(
			projectService,
			new EvaluationRepository(connection.db),
		);
		return await fn({ projectService, evaluationService });
	} finally {
		connection.client.close();
	}
}

export async function findOrCreateCliProject(
	projectService: ProjectService,
	args: ParsedArgs,
): Promise<ProjectProfile> {
	const projectInput = await loadProjectInput(args);
	return projectService.findOrCreate(projectInput);
}

export async function getOrCreateCliProject(
	projectService: ProjectService,
	args: ParsedArgs,
): Promise<ProjectProfile> {
	const projectInput = await loadProjectInput(args);
	const existing = await projectService.findByRootPath(projectInput.rootPath);
	return existing ?? projectService.create(projectInput);
}

export async function resolveEvaluationForCli(
	evaluationService: EvaluationService,
	project: ProjectProfile,
	selector: string,
): Promise<ProjectValueEvaluation> {
	const evaluation =
		selector === "latest"
			? await evaluationService.getLatestEvaluation(project.id)
			: await evaluationService.getEvaluation(selector);
	if (evaluation.projectId !== project.id) {
		throw new Error(
			`Evaluation ${evaluation.id} does not belong to project ${project.id}.`,
		);
	}
	return evaluation;
}

export function selectDimensionKeysForCli(
	evaluation: ProjectValueEvaluation,
	selector: string,
): EvaluationDimensionKey[] {
	const dimensions = evaluation.report?.dimensions ?? evaluation.dimensions;
	if (selector === "all") {
		return dimensions.map((dimension) => dimension.key);
	}
	if (selector.startsWith("lowest:")) {
		const limit = Number(selector.slice("lowest:".length));
		if (!Number.isInteger(limit) || limit < 1) {
			throw new Error("--dimensions lowest:<n> must use a positive integer.");
		}
		return dimensions
			.slice()
			.sort((a, b) => a.score - b.score)
			.slice(0, limit)
			.map((dimension) => dimension.key);
	}
	const keys = selector
		.split(",")
		.map((key) => key.trim())
		.filter(Boolean)
		.map((key) => evaluationDimensionKeySchema.parse(key));
	if (keys.length === 0) {
		throw new Error("Select at least one dimension.");
	}
	const availableKeys = new Set(dimensions.map((dimension) => dimension.key));
	const unavailable = keys.filter((key) => !availableKeys.has(key));
	if (unavailable.length > 0) {
		throw new Error(
			`Selected dimensions are not present in evaluation ${evaluation.id}: ${unavailable.join(", ")}.`,
		);
	}
	return keys;
}

export function printBundle(bundle: EvaluationBundle, json: boolean): void {
	if (json) {
		console.log(JSON.stringify({ bundle }, null, 2));
		return;
	}
	console.log(`Bundle: ${bundle.id}`);
	console.log(`Project: ${bundle.projectId}`);
	console.log(`Evidence Level: ${bundle.evidenceLevel}`);
	console.log(`Inputs: ${Object.keys(bundle.inputs).join(", ")}`);
	console.log(`Source Files: ${bundle.inputs.sourceFiles.length}`);
	console.log(`Verification Runs: ${bundle.inputs.verificationRuns.length}`);
	if (bundle.missingInputs.length > 0) {
		console.log(`Missing Inputs: ${bundle.missingInputs.join(", ")}`);
	}
}

export function printEvaluation(
	result: EvaluationResponse,
	json: boolean,
): void {
	if (json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}
	const { evaluation, improvements } = result;
	console.log(`Evaluation: ${evaluation.id}`);
	console.log(`Score: ${evaluation.score} / ${evaluation.idealScore}`);
	console.log(`Confidence: ${evaluation.overallConfidence}`);
	console.log(`Evidence Level: ${evaluation.evidenceLevel}`);
	if (evaluation.scoreDelta !== undefined) {
		console.log(`Score Delta: ${evaluation.scoreDelta}`);
	}
	if (evaluation.confidenceDelta !== undefined) {
		console.log(`Confidence Delta: ${evaluation.confidenceDelta}`);
	}
	console.log("\nVerification Runs:");
	for (const run of result.bundle.inputs.verificationRuns) {
		console.log(
			`- ${run.name}: ${run.status} (${run.durationMs}ms, exit ${run.exitCode ?? "n/a"})`,
		);
	}
	console.log("\nSource Checks:");
	for (const inspection of evaluation.sourceInspections) {
		console.log(
			`- ${inspection.title}: ${inspection.status} (${inspection.files.length} files)`,
		);
	}
	console.log("\nTop Gaps:");
	for (const gap of evaluation.gapsTo100.slice(0, 5)) {
		console.log(
			`- ${gap.title} (${gap.kind}, +${gap.expectedScoreGain} score, +${gap.expectedConfidenceGain} confidence)`,
		);
	}
	console.log("\nNext Improvements:");
	for (const improvement of improvements.slice(0, 5)) {
		console.log(
			`${improvement.priority}. ${improvement.title} (${improvement.taskType})`,
		);
	}
}

export function printFocusedImprovements(
	result: GenerateFocusedImprovementIdeasResponse & {
		schemaVersion: "project-evaluator.focused-improvements/v1";
		project: Pick<ProjectProfile, "id" | "rootPath" | "name">;
		evaluation: Pick<ProjectValueEvaluation, "id" | "score" | "createdAt">;
	},
	json: boolean,
): void {
	if (json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}
	console.log(`Evaluation: ${result.evaluation.id}`);
	console.log(
		`Selected Dimensions: ${result.selectedDimensionKeys.join(", ")}`,
	);
	console.log(`Focused Improvements: ${result.ideas.length}`);
	for (const [index, idea] of result.ideas.entries()) {
		console.log(`${index + 1}. ${idea.title}`);
	}
}

export function printNightWorkersTasks(
	exported: NightWorkersTasksExport,
	format: OutputFormat,
): void {
	if (format === "jsonl") {
		for (const task of exported.tasks) {
			console.log(JSON.stringify(task));
		}
		return;
	}
	console.log(JSON.stringify(exported, null, 2));
}
