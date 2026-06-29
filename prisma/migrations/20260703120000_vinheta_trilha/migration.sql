-- Trilhas ambiente exclusivas do módulo Vinhetas IA

CREATE TABLE IF NOT EXISTS "vinheta_trilha" (
  "id" TEXT NOT NULL,
  "nome" VARCHAR(160) NOT NULL,
  "storage_key" VARCHAR(300),
  "duration_ms" INTEGER,
  "uploaded_by" VARCHAR(200) NOT NULL,
  "uploaded_by_nome" VARCHAR(120) NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vinheta_trilha_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vinheta_trilha_uploaded_by_idx" ON "vinheta_trilha"("uploaded_by");

ALTER TABLE "vinheta" ADD COLUMN IF NOT EXISTS "trilha_vinheta_id" TEXT;
