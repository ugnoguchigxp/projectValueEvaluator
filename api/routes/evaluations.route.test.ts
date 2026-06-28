import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createEvaluationsRoute } from "./evaluations.route";

describe("evaluations route", () => {
	it("returns persisted activity events with evaluation details", async () => {
		const evaluationId = randomUUID();
		const evaluation = {
			id: evaluationId,
			projectId: randomUUID(),
			bundleId: randomUUID(),
			score: 82,
			idealScore: 100,
			overallConfidence: 0.72,
			evidenceLevel: "runtime-verified",
			summary: "Evaluation complete.",
			dimensions: [],
			strengths: [],
			gapsTo100: [],
			sourceInspections: [],
			notVerified: [],
			nextEvidenceToCollect: [],
			createdAt: new Date().toISOString(),
		};
		const activityEvents = [
			{
				id: randomUUID(),
				seq: 0,
				phase: "judge",
				level: "info",
				source: "codex",
				message: "Codex turn started.",
				status: "started",
				createdAt: new Date().toISOString(),
			},
		];
		const getEvaluation = vi.fn().mockResolvedValue(evaluation);
		const getActivityEvents = vi.fn().mockResolvedValue(activityEvents);
		const app = new Hono().route(
			"/evaluations",
			createEvaluationsRoute({
				evaluationService: {
					getEvaluation,
					getActivityEvents,
				} as never,
			}),
		);

		const res = await app.request(`/evaluations/${evaluationId}`);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			evaluation,
			activityEvents,
		});
		expect(getEvaluation).toHaveBeenCalledWith(evaluationId);
		expect(getActivityEvents).toHaveBeenCalledWith(evaluationId);
	});

	it("generates focused improvement ideas for selected dimensions", async () => {
		const evaluationId = randomUUID();
		const ideas = [
			{
				title: "Improve UI flow",
				targetDimensions: ["uiUx"],
				summary: "Make the result workflow easier to scan.",
				detailedPlan: "Move the main action into the result area.",
				implementationSteps: ["Add the action button", "Render the result card"],
				filesToInspect: ["web/src/views/home-view.tsx"],
				acceptanceCriteria: ["The selected dimension is used"],
				verificationCommands: ["bun run verify"],
				expectedImpact: "Better UI/UX score",
				risks: [],
			},
		];
		const judgeRun = {
			judge: "codex-agent",
			status: "completed",
			model: "gpt-5.5",
		};
		const generateFocusedImprovementIdeas = vi.fn().mockResolvedValue({
			ideas,
			judgeRun,
			selectedDimensionKeys: ["uiUx"],
		});
		const app = new Hono().route(
			"/evaluations",
			createEvaluationsRoute({
				evaluationService: {
					generateFocusedImprovementIdeas,
				} as never,
			}),
		);

		const res = await app.request(
			`/evaluations/${evaluationId}/focused-improvements`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					dimensionKeys: ["uiUx"],
					judge: {
						type: "codex-agent",
						model: "gpt-5.5",
						mode: "improvement-request",
					},
				}),
			},
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			ideas,
			judgeRun,
			selectedDimensionKeys: ["uiUx"],
		});
		expect(generateFocusedImprovementIdeas).toHaveBeenCalledWith({
			evaluationId,
			dimensionKeys: ["uiUx"],
			judge: {
				type: "codex-agent",
				model: "gpt-5.5",
				mode: "improvement-request",
			},
		});
	});
});
