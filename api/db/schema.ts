import { randomUUID } from "node:crypto";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
	"users",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		email: text("email").notNull().unique(),
		passwordHash: text("password_hash").notNull(),
		displayName: text("display_name").notNull(),
		role: text("role").notNull().default("member"),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => ({
		emailIdx: uniqueIndex("users_email_idx").on(table.email),
		roleIdx: index("users_role_idx").on(table.role),
		isActiveIdx: index("users_is_active_idx").on(table.isActive),
	}),
);

export const refreshTokens = sqliteTable(
	"refresh_tokens",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		token: text("token").notNull().unique(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => ({
		tokenIdx: uniqueIndex("refresh_tokens_token_idx").on(table.token),
		userIdIdx: index("refresh_tokens_user_id_idx").on(table.userId),
		expiresAtIdx: index("refresh_tokens_expires_at_idx").on(table.expiresAt),
	}),
);

export const projectProfiles = sqliteTable(
	"project_profiles",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		name: text("name").notNull(),
		rootPath: text("root_path").notNull(),
		ideal: text("ideal").notNull(),
		primaryAudience: text("primary_audience").notNull(),
		targetWorkflow: text("target_workflow").notNull(),
		nonGoalsJson: text("non_goals_json").notNull().default("[]"),
		dimensionsJson: text("dimensions_json").notNull().default("[]"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => ({
		nameIdx: index("project_profiles_name_idx").on(table.name),
		rootPathIdx: index("project_profiles_root_path_idx").on(table.rootPath),
	}),
);

export const evaluationBundles = sqliteTable(
	"evaluation_bundles",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		projectId: text("project_id")
			.notNull()
			.references(() => projectProfiles.id, { onDelete: "cascade" }),
		evidenceLevel: text("evidence_level").notNull(),
		projectRoot: text("project_root").notNull(),
		inputsJson: text("inputs_json").notNull(),
		inspectedInputsJson: text("inspected_inputs_json").notNull(),
		missingInputsJson: text("missing_inputs_json").notNull(),
		notVerifiedJson: text("not_verified_json").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => ({
		projectIdIdx: index("evaluation_bundles_project_id_idx").on(
			table.projectId,
		),
		createdAtIdx: index("evaluation_bundles_created_at_idx").on(
			table.createdAt,
		),
	}),
);

export const projectEvaluations = sqliteTable(
	"project_evaluations",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		projectId: text("project_id")
			.notNull()
			.references(() => projectProfiles.id, { onDelete: "cascade" }),
		bundleId: text("bundle_id")
			.notNull()
			.references(() => evaluationBundles.id, { onDelete: "cascade" }),
		score: integer("score").notNull(),
		idealScore: integer("ideal_score").notNull().default(100),
		overallConfidence: integer("overall_confidence").notNull(),
		evidenceLevel: text("evidence_level").notNull(),
		summary: text("summary").notNull(),
		dimensionsJson: text("dimensions_json").notNull(),
		strengthsJson: text("strengths_json").notNull(),
		gapsTo100Json: text("gaps_to_100_json").notNull(),
		notVerifiedJson: text("not_verified_json").notNull(),
		nextEvidenceToCollectJson: text("next_evidence_to_collect_json")
			.notNull()
			.default("[]"),
		previousScore: integer("previous_score"),
		scoreDelta: integer("score_delta"),
		previousConfidence: integer("previous_confidence"),
		confidenceDelta: integer("confidence_delta"),
		rawOutputJson: text("raw_output_json").notNull().default("{}"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => ({
		projectIdIdx: index("project_evaluations_project_id_idx").on(
			table.projectId,
		),
		bundleIdIdx: index("project_evaluations_bundle_id_idx").on(table.bundleId),
		createdAtIdx: index("project_evaluations_created_at_idx").on(
			table.createdAt,
		),
	}),
);

export const improvementRequests = sqliteTable(
	"improvement_requests",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		evaluationId: text("evaluation_id")
			.notNull()
			.references(() => projectEvaluations.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		reason: text("reason").notNull(),
		sourceGapIdsJson: text("source_gap_ids_json").notNull(),
		sourceDimensionKeysJson: text("source_dimension_keys_json").notNull(),
		expectedScoreGain: integer("expected_score_gain").notNull(),
		expectedConfidenceGain: integer("expected_confidence_gain").notNull(),
		complexity: integer("complexity").notNull(),
		priority: integer("priority").notNull(),
		taskType: text("task_type").notNull(),
		prompt: text("prompt").notNull(),
		acceptanceCriteriaJson: text("acceptance_criteria_json").notNull(),
		verificationCommandsJson: text("verification_commands_json").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => ({
		evaluationIdIdx: index("improvement_requests_evaluation_id_idx").on(
			table.evaluationId,
		),
		priorityIdx: index("improvement_requests_priority_idx").on(table.priority),
	}),
);
