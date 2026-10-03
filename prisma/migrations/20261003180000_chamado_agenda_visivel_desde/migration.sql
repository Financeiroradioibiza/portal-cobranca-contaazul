-- AlterTable
ALTER TABLE "chamado" ADD COLUMN "agenda_visivel_desde" TIMESTAMP(3);

-- Backfill: chamados existentes visíveis desde a criação
UPDATE "chamado" SET "agenda_visivel_desde" = "created_at" WHERE "agenda_visivel_desde" IS NULL;

-- AlterTable
ALTER TABLE "chamado" ADD COLUMN "agenda_visivel_notificado" BOOLEAN NOT NULL DEFAULT true;

-- Chamados legado já notificados
UPDATE "chamado" SET "agenda_visivel_notificado" = true;
