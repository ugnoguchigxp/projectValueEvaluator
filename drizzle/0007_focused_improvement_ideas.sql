CREATE TABLE IF NOT EXISTS "focused_improvement_ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"evaluation_id" text NOT NULL REFERENCES "project_evaluations"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"target_dimension_keys_json" text NOT NULL,
	"summary" text NOT NULL,
	"agent_prompt" text NOT NULL,
	"implementation_focus_json" text NOT NULL,
	"expected_outcome" text NOT NULL,
	"created_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "focused_improvement_ideas_evaluation_id_idx" ON "focused_improvement_ideas" ("evaluation_id");
CREATE INDEX IF NOT EXISTS "focused_improvement_ideas_created_at_idx" ON "focused_improvement_ideas" ("created_at");
