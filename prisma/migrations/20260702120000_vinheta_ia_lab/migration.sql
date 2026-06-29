-- Vinhetas IA: laboratório ElevenLabs + trilha + biblioteca salva

CREATE TYPE "VinhetaStatus" AS ENUM ('rascunho', 'gerando', 'preview', 'aprovada');

ALTER TYPE "VinhetaTipo" ADD VALUE IF NOT EXISTS 'ia';

ALTER TABLE "vinheta" ADD COLUMN IF NOT EXISTS "status" "VinhetaStatus" NOT NULL DEFAULT 'rascunho';
ALTER TABLE "vinheta" ADD COLUMN IF NOT EXISTS "voz_nome" VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE "vinheta" ADD COLUMN IF NOT EXISTS "trilha_musica_id" TEXT;
ALTER TABLE "vinheta" ADD COLUMN IF NOT EXISTS "criativo_user_id" VARCHAR(200);
ALTER TABLE "vinheta" ADD COLUMN IF NOT EXISTS "criativo_nome" VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE "vinheta" ADD COLUMN IF NOT EXISTS "aprovada_em" TIMESTAMP(3);

UPDATE "vinheta"
   SET "status" = 'aprovada'
 WHERE "storage_key" IS NOT NULL AND "storage_key" <> '';

UPDATE "vinheta"
   SET "status" = 'rascunho'
 WHERE "storage_key" IS NULL OR "storage_key" = '';

CREATE INDEX IF NOT EXISTS "vinheta_status_criativo_user_id_idx" ON "vinheta"("status", "criativo_user_id");
