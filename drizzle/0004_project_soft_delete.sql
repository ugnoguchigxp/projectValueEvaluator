ALTER TABLE "project_profiles"
ADD COLUMN "deleted_at" integer;

CREATE INDEX IF NOT EXISTS "project_profiles_deleted_at_idx" ON "project_profiles" ("deleted_at");
