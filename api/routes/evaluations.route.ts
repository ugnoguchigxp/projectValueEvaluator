import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
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
			const evaluation = await deps.evaluationService.getEvaluation(id);
			return c.json({ evaluation });
		})
		.get(
			"/:id/improvements",
			zValidator("param", evaluationIdParamSchema),
			async (c) => {
				const { id } = c.req.valid("param");
				const improvements = await deps.evaluationService.getImprovements(id);
				return c.json({ improvements });
			},
		);
}
