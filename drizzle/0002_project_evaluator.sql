PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "project_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"root_path" text NOT NULL,
	"ideal" text NOT NULL,
	"primary_audience" text NOT NULL,
	"target_workflow" text NOT NULL,
	"non_goals_json" text DEFAULT '[]' NOT NULL,
	"dimensions_json" text DEFAULT '[]' NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "project_profiles_name_idx" ON "project_profiles" ("name");
CREATE INDEX IF NOT EXISTS "project_profiles_root_path_idx" ON "project_profiles" ("root_path");

CREATE TABLE IF NOT EXISTS "evaluation_bundles" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "project_profiles"("id") ON DELETE cascade,
	"evidence_level" text NOT NULL,
	"project_root" text NOT NULL,
	"inputs_json" text NOT NULL,
	"inspected_inputs_json" text NOT NULL,
	"missing_inputs_json" text NOT NULL,
	"not_verified_json" text NOT NULL,
	"created_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "evaluation_bundles_project_id_idx" ON "evaluation_bundles" ("project_id");
CREATE INDEX IF NOT EXISTS "evaluation_bundles_created_at_idx" ON "evaluation_bundles" ("created_at");

CREATE TABLE IF NOT EXISTS "project_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "project_profiles"("id") ON DELETE cascade,
	"bundle_id" text NOT NULL REFERENCES "evaluation_bundles"("id") ON DELETE cascade,
	"score" integer NOT NULL,
	"ideal_score" integer DEFAULT 100 NOT NULL,
	"overall_confidence" integer NOT NULL,
	"evidence_level" text NOT NULL,
	"summary" text NOT NULL,
	"dimensions_json" text NOT NULL,
	"strengths_json" text NOT NULL,
	"gaps_to_100_json" text NOT NULL,
	"not_verified_json" text NOT NULL,
	"next_evidence_to_collect_json" text DEFAULT '[]' NOT NULL,
	"previous_score" integer,
	"score_delta" integer,
	"previous_confidence" integer,
	"confidence_delta" integer,
	"raw_output_json" text DEFAULT '{}' NOT NULL,
	"created_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "project_evaluations_project_id_idx" ON "project_evaluations" ("project_id");
CREATE INDEX IF NOT EXISTS "project_evaluations_bundle_id_idx" ON "project_evaluations" ("bundle_id");
CREATE INDEX IF NOT EXISTS "project_evaluations_created_at_idx" ON "project_evaluations" ("created_at");

CREATE TABLE IF NOT EXISTS "improvement_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"evaluation_id" text NOT NULL REFERENCES "project_evaluations"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"source_gap_ids_json" text NOT NULL,
	"source_dimension_keys_json" text NOT NULL,
	"expected_score_gain" integer NOT NULL,
	"expected_confidence_gain" integer NOT NULL,
	"complexity" integer NOT NULL,
	"priority" integer NOT NULL,
	"task_type" text NOT NULL,
	"prompt" text NOT NULL,
	"acceptance_criteria_json" text NOT NULL,
	"verification_commands_json" text NOT NULL,
	"created_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "improvement_requests_evaluation_id_idx" ON "improvement_requests" ("evaluation_id");
CREATE INDEX IF NOT EXISTS "improvement_requests_priority_idx" ON "improvement_requests" ("priority");
