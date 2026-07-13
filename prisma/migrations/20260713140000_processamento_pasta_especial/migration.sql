ALTER TABLE "processamento_job" ADD COLUMN IF NOT EXISTS "pasta_especial_id" TEXT;

CREATE INDEX IF NOT EXISTS "processamento_job_pasta_especial_id_idx"
  ON "processamento_job"("pasta_especial_id");
