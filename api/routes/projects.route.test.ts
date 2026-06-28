import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createProjectsRoute } from "./projects.route";

describe("projects route", () => {
	it("finds or creates a project instead of always inserting", async () => {
		const project = {
			id: randomUUID(),
			name: "sample",
			rootPath: "/tmp/sample",
			ideal: "Clear value evaluation",
			primaryAudience: "coding agents",
			targetWorkflow: "evaluate and improve",
			nonGoals: [],
			dimensions: ["conceptValue"],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		const findOrCreate = vi.fn().mockResolvedValue(project);
		const app = new Hono().route(
			"/projects",
			createProjectsRoute({
				projectService: {
					findOrCreate,
				} as never,
				evaluationService: {} as never,
			}),
		);

		const res = await app.request("/projects", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: project.name,
				rootPath: project.rootPath,
				ideal: project.ideal,
				primaryAudience: project.primaryAudience,
				targetWorkflow: project.targetWorkflow,
				nonGoals: project.nonGoals,
				dimensions: project.dimensions,
			}),
		});

		expect(res.status).toBe(201);
		expect(findOrCreate).toHaveBeenCalledOnce();
		await expect(res.json()).resolves.toEqual({ project });
	});

	it("lists saved projects", async () => {
		const project = {
			id: randomUUID(),
			name: "sample",
			rootPath: "/tmp/sample",
			ideal: "Clear value evaluation",
			primaryAudience: "coding agents",
			targetWorkflow: "evaluate and improve",
			nonGoals: [],
			dimensions: ["conceptValue"],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		const app = new Hono().route(
			"/projects",
			createProjectsRoute({
				projectService: {
					list: vi.fn().mockResolvedValue([project]),
				} as never,
				evaluationService: {} as never,
			}),
		);

		const res = await app.request("/projects");

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ projects: [project] });
	});

	it("soft deletes a project", async () => {
		const project = {
			id: randomUUID(),
			name: "sample",
			rootPath: "/tmp/sample",
			ideal: "Clear value evaluation",
			primaryAudience: "coding agents",
			targetWorkflow: "evaluate and improve",
			nonGoals: [],
			dimensions: ["conceptValue"],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		const softDelete = vi.fn().mockResolvedValue(project);
		const app = new Hono().route(
			"/projects",
			createProjectsRoute({
				projectService: {
					softDelete,
				} as never,
				evaluationService: {} as never,
			}),
		);

		const res = await app.request(`/projects/${project.id}`, {
			method: "DELETE",
		});

		expect(res.status).toBe(200);
		expect(softDelete).toHaveBeenCalledWith(project.id);
		await expect(res.json()).resolves.toEqual({ project });
	});

	it("lists project evaluation history", async () => {
		const projectId = randomUUID();
		const evaluation = {
			id: randomUUID(),
			projectId,
			score: 82,
			idealScore: 100,
			overallConfidence: 0.72,
			evidenceLevel: "code-sampled",
			createdAt: new Date().toISOString(),
		};
		const app = new Hono().route(
			"/projects",
			createProjectsRoute({
				projectService: {} as never,
				evaluationService: {
					listProjectEvaluations: vi.fn().mockResolvedValue([evaluation]),
				} as never,
			}),
		);

		const res = await app.request(`/projects/${projectId}/evaluations`);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ evaluations: [evaluation] });
	});

	it("streams evaluation activity before the final result", async () => {
		const projectId = randomUUID();
		const evaluation = {
			id: randomUUID(),
			projectId,
			score: 82,
			idealScore: 100,
			overallConfidence: 0.72,
			evidenceLevel: "runtime-verified",
			createdAt: new Date().toISOString(),
		};
		const activity = {
			id: randomUUID(),
			seq: 0,
			phase: "judge",
			level: "info" as const,
			source: "codex",
			message: "Codex turn started.",
			status: "started",
			createdAt: new Date().toISOString(),
		};
		const evaluateProject = vi.fn(
			async (params: {
				emitActivity?: (event: {
					id: string;
					seq: number;
					phase: string;
					level: "info";
					source: string;
					message: string;
					status: string;
					createdAt: string;
				}) => Promise<void> | void;
			}) => {
			await params.emitActivity?.(activity);
			return {
				activityEvents: [activity],
				bundle: {
					inputs: {
						sourceFiles: [],
						verificationRuns: [],
					},
				},
				evaluation,
				improvements: [],
			};
			},
		);
		const app = new Hono().route(
			"/projects",
			createProjectsRoute({
				projectService: {} as never,
				evaluationService: {
					evaluateProject,
				} as never,
			}),
		);

		const res = await app.request(`/projects/${projectId}/evaluations/stream`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ projectRoot: "/tmp/sample" }),
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/x-ndjson");
		const messages = (await res.text())
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(messages[0]).toMatchObject({
			type: "activity",
			activity: {
				id: activity.id,
				seq: 0,
				phase: "judge",
				source: "codex",
				status: "started",
			},
		});
		expect(messages[1]).toMatchObject({
			type: "result",
			result: { evaluation },
		});
			expect(evaluateProject).toHaveBeenCalledWith(
				expect.objectContaining({
					projectId,
					emitActivity: expect.any(Function),
				}),
			);
			expect(evaluateProject.mock.calls[0]?.[0]).not.toHaveProperty(
				"projectRoot",
			);
		});
	});
