import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	defaultEvaluationDimensions,
	type ProjectProfile,
} from "../../../shared/schemas/project.schema";
import { judgeProjectValue } from "../llm/judge-client";
import { buildEvaluationBundle } from "./bundle-builder";
import { generateImprovementRequests } from "./improvement-generator";

describe("evaluation MVP pipeline", () => {
	it("creates a bundle, evaluation, improvements, and re-evaluation delta", async () => {
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
		const firstJudged = await judgeProjectValue({
			project,
			bundle: firstBundle,
		});
		const firstImprovements = generateImprovementRequests(firstJudged.evaluation);

		expect(firstJudged.evaluation.score).toBeGreaterThan(0);
		expect(firstJudged.evaluation.overallConfidence).toBeGreaterThan(0);
		expect(firstBundle.inspectedInputs.readme).toBe(true);
		expect(firstImprovements.length).toBeGreaterThan(0);
		expect(firstImprovements[0]?.sourceGapIds.length).toBeGreaterThan(0);

		const secondBundle = await buildEvaluationBundle({
			project,
			previousEvaluation: firstJudged.evaluation,
		});
		const secondJudged = await judgeProjectValue({
			project,
			bundle: secondBundle,
			previousEvaluation: firstJudged.evaluation,
		});

		expect(secondJudged.evaluation.previousScore).toBe(
			firstJudged.evaluation.score,
		);
		expect(secondJudged.evaluation.scoreDelta).toBe(0);
		expect(secondJudged.evaluation.previousConfidence).toBe(
			firstJudged.evaluation.overallConfidence,
		);
		expect(secondJudged.evaluation.confidenceDelta).toBe(0);
	});
});
