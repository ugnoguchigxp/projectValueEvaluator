import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
	ProjectProfile,
	ProjectProfileCreate,
} from "../../../shared/schemas/project.schema";
import { ProjectService } from "./project.service";

function projectProfile(
	overrides: Partial<ProjectProfile> = {},
): ProjectProfile {
	const now = new Date().toISOString();
	return {
		id: randomUUID(),
		name: "ProjectValueEvaluator",
		rootPath: "/tmp/todo",
		ideal: "ProjectValueEvaluator evaluates project value.",
		primaryAudience: "coding agents",
		targetWorkflow: "value evaluation",
		nonGoals: [],
		dimensions: ["conceptValue"],
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

describe("ProjectService", () => {
	it("updates an existing rootPath with the latest profile input", async () => {
		const existing = projectProfile();
		const updated = projectProfile({
			id: existing.id,
			name: "Todo List",
			ideal: "Users can manage todo items reliably.",
			targetWorkflow: "manage todo items",
		});
		const repository = {
			findByRootPath: vi.fn().mockResolvedValue(existing),
			update: vi.fn().mockResolvedValue(updated),
			create: vi.fn(),
		};
		const service = new ProjectService(repository as never);
		const input: ProjectProfileCreate = {
			name: updated.name,
			rootPath: updated.rootPath,
			ideal: updated.ideal,
			primaryAudience: updated.primaryAudience,
			targetWorkflow: updated.targetWorkflow,
			nonGoals: updated.nonGoals,
			dimensions: updated.dimensions,
		};

		await expect(service.findOrCreate(input)).resolves.toEqual(updated);
		expect(repository.update).toHaveBeenCalledWith(existing.id, input);
		expect(repository.create).not.toHaveBeenCalled();
	});
});
