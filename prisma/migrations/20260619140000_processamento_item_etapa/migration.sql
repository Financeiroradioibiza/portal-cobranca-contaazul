-- Etapa por faixa (Kanban da fila de processamento).

ALTER TABLE "processamento_item"
  ADD COLUMN IF NOT EXISTS "etapa_atual" VARCHAR(24) NOT NULL DEFAULT 'upload';

CREATE INDEX IF NOT EXISTS "processamento_item_job_id_etapa_idx"
  ON "processamento_item"("job_id", "etapa_atual");

-- Itens já concluídos aparecem na última coluna.
UPDATE "processamento_item"
SET "etapa_atual" = 'armazenamento'
WHERE "status" = 'concluido';

UPDATE "processamento_item"
SET "etapa_atual" = 'deduplicacao'
WHERE "status" = 'duplicata';
