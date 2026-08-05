-- Ordem explícita na fila de processamento (maior = processa antes; step 5).
ALTER TABLE "processamento_job" ADD COLUMN IF NOT EXISTS "fila_ordem" INTEGER;

CREATE INDEX IF NOT EXISTS "processamento_job_status_fila_ordem_idx"
  ON "processamento_job" ("status", "fila_ordem");

-- Backfill: mais recente = número maior (1000, 995, 990…).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
  FROM "processamento_job"
  WHERE "fila_ordem" IS NULL
)
UPDATE "processamento_job" AS j
SET "fila_ordem" = 1000 - (ranked.rn - 1) * 5
FROM ranked
WHERE j.id = ranked.id;
