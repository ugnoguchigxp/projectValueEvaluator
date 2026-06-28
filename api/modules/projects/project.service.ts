import {
	projectProfileInputSchema,
	type ProjectProfile,
	type ProjectProfileInput,
} from "../../../shared/schemas/project.schema";
import { HttpError } from "../auth/errors";
import type { ProjectRepository } from "./project.repository";

export class ProjectService {
	constructor(private readonly projects: ProjectRepository) {}

	async create(input: ProjectProfileInput): Promise<ProjectProfile> {
		const parsed = projectProfileInputSchema.parse(input);
		return this.projects.create(parsed);
	}

	async findOrCreate(input: ProjectProfileInput): Promise<ProjectProfile> {
		const parsed = projectProfileInputSchema.parse(input);
		const existing = await this.projects.findByRootPath(parsed.rootPath);
		if (!existing) {
			return this.projects.create(parsed);
		}
		return (await this.projects.update(existing.id, parsed)) ?? existing;
	}

	async get(projectId: string): Promise<ProjectProfile> {
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new HttpError(404, "Project profile not found.");
		}
		return project;
	}

	async findByRootPath(rootPath: string): Promise<ProjectProfile | null> {
		return this.projects.findByRootPath(rootPath);
	}

	async list(): Promise<ProjectProfile[]> {
		return this.projects.list();
	}

	async softDelete(projectId: string): Promise<ProjectProfile> {
		const project = await this.projects.softDelete(projectId);
		if (!project) {
			throw new HttpError(404, "Project profile not found.");
		}
		return project;
	}
}
