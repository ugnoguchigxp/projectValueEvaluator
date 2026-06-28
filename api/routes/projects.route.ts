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

function streamEvaluation(
	params: {
		projectId: string;
		projectRoot?: string;
		baselinePrompt?: string;
		judge?: z.infer<typeof createEvaluationRequestSchema>["judge"];
	},
	deps: ProjectRouteDeps,
) {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream({
			async start(controller) {
				const send = (value: unknown) => {
					controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
				};
				try {
					const result = await deps.evaluationService.evaluateProject({
						projectId: params.projectId,
						baselinePrompt: params.baselinePrompt,
						judge: params.judge,
						emitActivity: async (activity) => {
							send({ type: "activity", activity });
						},
					});
					send({ type: "result", result });
				} catch (error) {
					send({
						type: "error",
						message: error instanceof Error ? error.message : String(error),
					});
				} finally {
					controller.close();
				}
			},
		}),
		{
			headers: {
				"Content-Type": "application/x-ndjson; charset=utf-8",
				"Cache-Control": "no-cache",
			},
		},
	);
}

export function createProjectsRoute(deps: ProjectRouteDeps) {
	return new Hono()
		.get("/", async (c) => {
			const projects = await deps.projectService.list();
			return c.json({ projects });
		})
		.post("/", zValidator("json", projectProfileInputSchema), async (c) => {
			const project = await deps.projectService.findOrCreate(
				c.req.valid("json"),
			);
			return c.json({ project }, 201);
		})
		.get("/:id", zValidator("param", projectIdParamSchema), async (c) => {
			const { id } = c.req.valid("param");
			const project = await deps.projectService.get(id);
			return c.json({ project });
		})
		.delete("/:id", zValidator("param", projectIdParamSchema), async (c) => {
			const { id } = c.req.valid("param");
			const project = await deps.projectService.softDelete(id);
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
					baselinePrompt: body.baselinePrompt,
					judge: body.judge,
				});
				return c.json(result, 201);
			},
		)
		.post(
			"/:id/evaluations/stream",
			zValidator("param", projectIdParamSchema),
			zValidator("json", createEvaluationRequestSchema),
			async (c) => {
				const { id } = c.req.valid("param");
				const body = c.req.valid("json");
				return streamEvaluation(
					{
						projectId: id,
						baselinePrompt: body.baselinePrompt,
						judge: body.judge,
					},
					deps,
				);
			},
		)
		.get(
			"/:id/evaluations",
			zValidator("param", projectIdParamSchema),
			async (c) => {
				const { id } = c.req.valid("param");
				const evaluations =
					await deps.evaluationService.listProjectEvaluations(id);
				return c.json({ evaluations });
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
					baselinePrompt: body.baselinePrompt,
					judge: body.judge,
				});
				return c.json(result, 201);
			},
		)
		.post(
			"/:id/reevaluate/stream",
			zValidator("param", projectIdParamSchema),
			zValidator("json", createEvaluationRequestSchema),
			async (c) => {
				const { id } = c.req.valid("param");
				const body = c.req.valid("json");
				return streamEvaluation(
					{
						projectId: id,
						baselinePrompt: body.baselinePrompt,
						judge: body.judge,
					},
					deps,
				);
			},
		);
}
