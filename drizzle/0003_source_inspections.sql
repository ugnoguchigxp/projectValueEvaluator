ALTER TABLE "project_evaluations"
ADD COLUMN "source_inspections_json" text DEFAULT '[]' NOT NULL;
