-- Vinhetas clientes (biblioteca) + flags de processamento + pasta de vinhetas + horários fixos

CREATE TABLE IF NOT EXISTS "biblioteca_vinheta_cliente" (
  "musica_id" TEXT NOT NULL,
  "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "biblioteca_vinheta_cliente_pkey" PRIMARY KEY ("musica_id"),
  CONSTRAINT "biblioteca_vinheta_cliente_musica_id_fkey"
    FOREIGN KEY ("musica_id") REFERENCES "musica_biblioteca"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "processamento_job"
  ADD COLUMN IF NOT EXISTS "destino_vinheta_cliente" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "processamento_job"
  ADD COLUMN IF NOT EXISTS "skip_ponto_mix" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "vinheta_pasta" (
  "id" TEXT NOT NULL,
  "programacao_id" TEXT NOT NULL,
  "nome" VARCHAR(120) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vinheta_pasta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vinheta_pasta_programacao_id_fkey"
    FOREIGN KEY ("programacao_id") REFERENCES "programacao"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "vinheta_pasta_programacao_id_sort_order_idx"
  ON "vinheta_pasta"("programacao_id", "sort_order");

CREATE TABLE IF NOT EXISTS "vinheta_pasta_item" (
  "id" TEXT NOT NULL,
  "vinheta_pasta_id" TEXT NOT NULL,
  "vinheta_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "vinheta_pasta_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vinheta_pasta_item_vinheta_pasta_id_fkey"
    FOREIGN KEY ("vinheta_pasta_id") REFERENCES "vinheta_pasta"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vinheta_pasta_item_vinheta_id_fkey"
    FOREIGN KEY ("vinheta_id") REFERENCES "vinheta"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "vinheta_pasta_item_vinheta_pasta_id_vinheta_id_key"
  ON "vinheta_pasta_item"("vinheta_pasta_id", "vinheta_id");

CREATE TYPE "VinhetaHorarioFixoTipo" AS ENUM ('abertura', 'encerramento');

CREATE TABLE IF NOT EXISTS "programacao_vinheta_horario_fixo" (
  "id" TEXT NOT NULL,
  "programacao_id" TEXT NOT NULL,
  "tipo" "VinhetaHorarioFixoTipo" NOT NULL,
  "vinheta_id" TEXT,
  "hora" VARCHAR(5) NOT NULL DEFAULT '09:00',
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "programacao_vinheta_horario_fixo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "programacao_vinheta_horario_fixo_programacao_id_fkey"
    FOREIGN KEY ("programacao_id") REFERENCES "programacao"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "programacao_vinheta_horario_fixo_vinheta_id_fkey"
    FOREIGN KEY ("vinheta_id") REFERENCES "vinheta"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "programacao_vinheta_horario_fixo_programacao_id_tipo_key"
  ON "programacao_vinheta_horario_fixo"("programacao_id", "tipo");

ALTER TYPE "AgendamentoAlvo" ADD VALUE IF NOT EXISTS 'vinheta_pasta';
