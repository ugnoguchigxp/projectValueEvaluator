import { and, desc, eq, isNull } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
	projectProfileSchema,
	type ProjectProfile,
	type ProjectProfileCreate,
} from "../../../shared/schemas/project.schema";
import { projectProfiles } from "../../db/schema";
import type * as schema from "../../db/schema";

const parseJsonArray = (value: string): string[] => {
	const parsed = JSON.parse(value) as unknown;
	return Array.isArray(parsed) ? parsed.map(String) : [];
};

const toIso = (value: Date): string => value.toISOString();

function toProjectProfile(
	row: typeof projectProfiles.$inferSelect,
): ProjectProfile {
	return projectProfileSchema.parse({
		id: row.id,
		name: row.name,
		rootPath: row.rootPath,
		ideal: row.ideal,
		primaryAudience: row.primaryAudience,
		targetWorkflow: row.targetWorkflow,
		nonGoals: parseJsonArray(row.nonGoalsJson),
		dimensions: parseJsonArray(row.dimensionsJson),
		createdAt: toIso(row.createdAt),
		updatedAt: toIso(row.updatedAt),
	});
}

export class ProjectRepository {
	constructor(private readonly db: BunSQLiteDatabase<typeof schema>) {}

	async create(input: ProjectProfileCreate): Promise<ProjectProfile> {
		const now = new Date();
		const [row] = await this.db
			.insert(projectProfiles)
			.values({
				name: input.name,
				rootPath: input.rootPath,
				ideal: input.ideal,
				primaryAudience: input.primaryAudience,
				targetWorkflow: input.targetWorkflow,
				nonGoalsJson: JSON.stringify(input.nonGoals),
				dimensionsJson: JSON.stringify(input.dimensions),
				createdAt: now,
				updatedAt: now,
			})
			.returning();
		return toProjectProfile(row);
	}

	async update(
		id: string,
		input: ProjectProfileCreate,
	): Promise<ProjectProfile | null> {
		const now = new Date();
		const [row] = await this.db
			.update(projectProfiles)
			.set({
				name: input.name,
				rootPath: input.rootPath,
				ideal: input.ideal,
				primaryAudience: input.primaryAudience,
				targetWorkflow: input.targetWorkflow,
				nonGoalsJson: JSON.stringify(input.nonGoals),
				dimensionsJson: JSON.stringify(input.dimensions),
				updatedAt: now,
			})
			.where(and(eq(projectProfiles.id, id), isNull(projectProfiles.deletedAt)))
			.returning();
		return row ? toProjectProfile(row) : null;
	}

	async findById(id: string): Promise<ProjectProfile | null> {
		const row = await this.db.query.projectProfiles.findFirst({
			where: and(eq(projectProfiles.id, id), isNull(projectProfiles.deletedAt)),
		});
		return row ? toProjectProfile(row) : null;
	}

	async list(): Promise<ProjectProfile[]> {
		const rows = await this.db.query.projectProfiles.findMany({
			where: isNull(projectProfiles.deletedAt),
			orderBy: [desc(projectProfiles.updatedAt)],
		});
		return rows.map(toProjectProfile);
	}

	async findByRootPath(rootPath: string): Promise<ProjectProfile | null> {
		const row = await this.db.query.projectProfiles.findFirst({
			where: and(
				eq(projectProfiles.rootPath, rootPath),
				isNull(projectProfiles.deletedAt),
			),
			orderBy: [desc(projectProfiles.updatedAt)],
		});
		return row ? toProjectProfile(row) : null;
	}

	async softDelete(id: string): Promise<ProjectProfile | null> {
		const now = new Date();
		const [row] = await this.db
			.update(projectProfiles)
			.set({
				deletedAt: now,
				updatedAt: now,
			})
			.where(and(eq(projectProfiles.id, id), isNull(projectProfiles.deletedAt)))
			.returning();
		return row ? toProjectProfile(row) : null;
	}
}
