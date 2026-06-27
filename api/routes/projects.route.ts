import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { createEvaluationRequestSchema } from "../../shared/schemas/evaluation.schema";
import { projectProfileInputSchema } from "../../shared/schemas/project.schema";
import type { EvaluationService } from "../modules/evaluations/evaluation.service";
import type { ProjectService } from "../modules/projects/project.service";

type ProjectRouteDeps = {
	projectService: ProjectService;
	evaluationService: EvaluationService;
};

const projectIdParamSchema = z.object({
	id: z.string().uuid(),
});

export function createProjectsRoute(deps: ProjectRouteDeps) {
	return new Hono()
		.post("/", zValidator("json", projectProfileInputSchema), async (c) => {
			const project = await deps.projectService.create(c.req.valid("json"));
			return c.json({ project }, 201);
		})
		.get("/:id", zValidator("param", projectIdParamSchema), async (c) => {
			const { id } = c.req.valid("param");
			const project = await deps.projectService.get(id);
			return c.json({ project });
		})
		.post(
			"/:id/evaluations",
			zValidator("param", projectIdParamSchema),
			zValidator("json", createEvaluationRequestSchema),
			async (c) => {
				const { id } = c.req.valid("param");
				const body = c.req.valid("json");
				const result = await deps.evaluationService.evaluateProject({
					projectId: id,
					projectRoot: body.projectRoot,
				});
				return c.json(result, 201);
			},
		)
		.get(
			"/:id/evaluations/latest",
			zValidator("param", projectIdParamSchema),
			async (c) => {
				const { id } = c.req.valid("param");
				const evaluation = await deps.evaluationService.getLatestEvaluation(id);
				return c.json({ evaluation });
			},
		)
		.post(
			"/:id/reevaluate",
			zValidator("param", projectIdParamSchema),
			zValidator("json", createEvaluationRequestSchema),
			async (c) => {
				const { id } = c.req.valid("param");
				const body = c.req.valid("json");
				const result = await deps.evaluationService.evaluateProject({
					projectId: id,
					projectRoot: body.projectRoot,
				});
				return c.json(result, 201);
			},
		);
}
