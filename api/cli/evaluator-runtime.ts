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
} from "../../shared/schemas/project.schema";
import type {
	EvaluationBundle,
	EvaluationResponse,
} from "../../shared/schemas/evaluation.schema";

type ParsedArgs = {
	project?: string;
	profile?: string;
	json: boolean;
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

export function parseEvaluatorArgs(argv: string[]): ParsedArgs {
	const parsed: ParsedArgs = { json: false };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--json") {
			parsed.json = true;
			continue;
		}
		if (arg === "--project") {
			parsed.project = readRequiredValue(argv, index, "--project");
			index += 1;
			continue;
		}
		if (arg === "--profile") {
			parsed.profile = readRequiredValue(argv, index, "--profile");
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	if (!parsed.project) {
		throw new Error("Missing required --project <path> argument.");
	}
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
	const packageJsonPath = path.join(rootPath, "package.json");
	let fallbackName = path.basename(rootPath);
	try {
		const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
			name?: string;
		};
		fallbackName = packageJson.name ?? fallbackName;
	} catch {
		// The bundle builder records missing package.json; CLI profile loading can continue.
	}
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

export function printBundle(bundle: EvaluationBundle, json: boolean): void {
	if (json) {
		console.log(JSON.stringify({ bundle }, null, 2));
		return;
	}
	console.log(`Bundle: ${bundle.id}`);
	console.log(`Project: ${bundle.projectId}`);
	console.log(`Evidence Level: ${bundle.evidenceLevel}`);
	console.log(`Inputs: ${Object.keys(bundle.inputs).join(", ")}`);
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
