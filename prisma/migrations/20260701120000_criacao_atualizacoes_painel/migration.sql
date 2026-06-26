-- CreateEnum
CREATE TYPE "TipoSubidaAtualizacao" AS ENUM ('install', 'atl', 'especial');

-- AlterTable programacao_atualizacao
ALTER TABLE "programacao_atualizacao" ADD COLUMN "tipo_subida" "TipoSubidaAtualizacao" NOT NULL DEFAULT 'atl';
ALTER TABLE "programacao_atualizacao" ADD COLUMN "especial_nome" VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE "programacao_atualizacao" ADD COLUMN "competencia" VARCHAR(7) NOT NULL DEFAULT '';
ALTER TABLE "programacao_atualizacao" ADD COLUMN "rotulo_log" VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE "programacao_atualizacao" ADD COLUMN "cliente_nome_log" VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE "programacao_atualizacao" ADD COLUMN "programacao_nome_log" VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE "programacao_atualizacao" ADD COLUMN "pdvs_log" VARCHAR(500) NOT NULL DEFAULT '';

UPDATE "programacao_atualizacao"
SET
  rotulo_log = codigo,
  competencia = to_char("disparada_em" AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
WHERE rotulo_log = '';

UPDATE "programacao_atualizacao"
SET tipo_subida = 'install'
WHERE revision = 1
  AND id IN (
    SELECT pa.id
    FROM "programacao_atualizacao" pa
    INNER JOIN (
      SELECT programacao_id, MIN(disparada_em) AS first_em
      FROM "programacao_atualizacao"
      GROUP BY programacao_id
    ) f ON f.programacao_id = pa.programacao_id AND f.first_em = pa.disparada_em
  );

-- CreateTable
CREATE TABLE "criacao_atualizacao_painel" (
    "id" TEXT NOT NULL,
    "competencia" VARCHAR(7) NOT NULL,
    "programacao_id" TEXT NOT NULL,
    "cliente_ref" VARCHAR(120) NOT NULL,
    "cliente_nome" VARCHAR(200) NOT NULL DEFAULT '',
    "programacao_nome" VARCHAR(120) NOT NULL DEFAULT '',
    "criativo_entregue_em" TIMESTAMP(3),
    "criativo_entregue_por" VARCHAR(200) NOT NULL DEFAULT '',
    "subida_fila_em" TIMESTAMP(3),
    "subida_fila_por" VARCHAR(200) NOT NULL DEFAULT '',
    "subida_fila_job_id" TEXT,
    "fechamentos_json" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "criacao_atualizacao_painel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "criacao_atualizacao_painel_competencia_programacao_id_key" ON "criacao_atualizacao_painel"("competencia", "programacao_id");
CREATE INDEX "criacao_atualizacao_painel_competencia_idx" ON "criacao_atualizacao_painel"("competencia");
CREATE INDEX "programacao_atualizacao_programacao_id_competencia_idx" ON "programacao_atualizacao"("programacao_id", "competencia");

ALTER TABLE "criacao_atualizacao_painel" ADD CONSTRAINT "criacao_atualizacao_painel_programacao_id_fkey" FOREIGN KEY ("programacao_id") REFERENCES "programacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
