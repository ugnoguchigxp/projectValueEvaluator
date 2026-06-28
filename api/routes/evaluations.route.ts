import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { generateFocusedImprovementIdeasRequestSchema } from "../../shared/schemas/evaluation.schema";
import type { EvaluationService } from "../modules/evaluations/evaluation.service";

type EvaluationRouteDeps = {
	evaluationService: EvaluationService;
};

const evaluationIdParamSchema = z.object({
	id: z.string().uuid(),
});

export function createEvaluationsRoute(deps: EvaluationRouteDeps) {
	return new Hono()
		.get("/:id", zValidator("param", evaluationIdParamSchema), async (c) => {
			const { id } = c.req.valid("param");
			const [evaluation, activityEvents] = await Promise.all([
				deps.evaluationService.getEvaluation(id),
				deps.evaluationService.getActivityEvents(id),
			]);
			return c.json({ evaluation, activityEvents });
		})
		.get(
			"/:id/improvements",
			zValidator("param", evaluationIdParamSchema),
			async (c) => {
				const { id } = c.req.valid("param");
				const improvements = await deps.evaluationService.getImprovements(id);
				return c.json({ improvements });
			},
		)
		.post(
			"/:id/focused-improvements",
			zValidator("param", evaluationIdParamSchema),
			zValidator("json", generateFocusedImprovementIdeasRequestSchema),
			async (c) => {
				const { id } = c.req.valid("param");
				const body = c.req.valid("json");
				const result =
					await deps.evaluationService.generateFocusedImprovementIdeas({
						evaluationId: id,
						dimensionKeys: body.dimensionKeys,
						judge: body.judge,
					});
				return c.json(result);
			},
		);
}
