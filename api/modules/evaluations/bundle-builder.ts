import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
	evaluationBundleSchema,
	type EvaluationBundle,
	type ProjectValueEvaluation,
} from "../../../shared/schemas/evaluation.schema";
import type { ProjectProfile } from "../../../shared/schemas/project.schema";

const IGNORED_TREE_ENTRIES = new Set([
	".git",
	".DS_Store",
	".env",
	".env.local",
	".env.test",
	"node_modules",
	"dist",
	"dist-web",
	"coverage",
	".vite",
	".next",
	".turbo",
	"sqlite.db",
]);

const MAX_TEXT_CHARS = 24_000;
const MAX_TREE_ENTRIES = 360;
const MAX_TREE_DEPTH = 4;

async function readOptionalText(
	root: string,
	filename: string,
	missingInputs: string[],
): Promise<string | undefined> {
	try {
		const text = await readFile(path.join(root, filename), "utf8");
		return text.slice(0, MAX_TEXT_CHARS);
	} catch {
		missingInputs.push(filename);
		return undefined;
	}
}

async function readPackageJson(
	root: string,
	missingInputs: string[],
): Promise<Record<string, unknown> | undefined> {
	const text = await readOptionalText(root, "package.json", missingInputs);
	if (!text) return undefined;
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		missingInputs.push("package.json:invalid-json");
		return undefined;
	}
}

function packageScripts(
	packageJson: Record<string, unknown> | undefined,
): Record<string, string> {
	const scripts = packageJson?.scripts;
	if (!scripts || typeof scripts !== "object") return {};
	return Object.fromEntries(
		Object.entries(scripts).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
}

async function collectTree(
	root: string,
	current: string,
	depth: number,
	entries: string[],
): Promise<void> {
	if (entries.length >= MAX_TREE_ENTRIES || depth > MAX_TREE_DEPTH) return;
	let dirents: Dirent[];
	try {
		dirents = await readdir(path.join(root, current), { withFileTypes: true });
	} catch {
		return;
	}
	for (const dirent of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entries.length >= MAX_TREE_ENTRIES) return;
		if (IGNORED_TREE_ENTRIES.has(dirent.name)) continue;
		if (dirent.name.endsWith(".sqlite") || dirent.name.endsWith(".sqlite3")) {
			continue;
		}
		const relativePath = path.join(current, dirent.name);
		entries.push(dirent.isDirectory() ? `${relativePath}/` : relativePath);
		if (dirent.isDirectory()) {
			await collectTree(root, relativePath, depth + 1, entries);
		}
	}
}

export async function buildEvaluationBundle(params: {
	project: ProjectProfile;
	projectRoot?: string;
	previousEvaluation?: ProjectValueEvaluation | null;
}): Promise<EvaluationBundle> {
	const projectRoot = path.resolve(
		params.projectRoot ?? params.project.rootPath,
	);
	const missingInputs: string[] = [];
	const readme = await readOptionalText(
		projectRoot,
		"README.md",
		missingInputs,
	);
	const llmContext = await readOptionalText(
		projectRoot,
		"LLM_CONTEXT.md",
		missingInputs,
	);
	const agents = await readOptionalText(
		projectRoot,
		"AGENTS.md",
		missingInputs,
	);
	const packageJson = await readPackageJson(projectRoot, missingInputs);
	const repoTree: string[] = [];
	await collectTree(projectRoot, "", 1, repoTree);
	if (repoTree.length === 0) {
		missingInputs.push("repo-tree");
	}
	const scripts = packageScripts(packageJson);
	const notVerified = [
		"local build",
		"test execution",
		"runtime behavior",
		"sample output quality",
		"audit-grade security behavior",
	];

	return evaluationBundleSchema.parse({
		id: randomUUID(),
		projectId: params.project.id,
		evidenceLevel: "repo-structure",
		projectRoot,
		inputs: {
			readme,
			llmContext,
			agents,
			packageJson,
			repoTree,
			scripts,
			previousEvaluation: params.previousEvaluation ?? undefined,
		},
		inspectedInputs: {
			readme: Boolean(readme),
			llmContext: Boolean(llmContext),
			agents: Boolean(agents),
			packageJson: Boolean(packageJson),
			repoTree: repoTree.length > 0,
			sourceFilesSampled: [],
			testsExecuted: false,
			buildExecuted: false,
			appLaunched: false,
			sampleOutputReviewed: false,
		},
		missingInputs,
		notVerified,
		createdAt: new Date().toISOString(),
	});
}
