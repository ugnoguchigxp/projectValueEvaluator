CREATE TABLE IF NOT EXISTS "evaluation_activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"evaluation_id" text NOT NULL REFERENCES "project_evaluations"("id") ON DELETE cascade,
	"seq" integer NOT NULL,
	"phase" text NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"status" text,
	"payload_json" text,
	"created_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "evaluation_activity_events_evaluation_id_idx" ON "evaluation_activity_events" ("evaluation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "evaluation_activity_events_evaluation_seq_idx" ON "evaluation_activity_events" ("evaluation_id", "seq");
