ALTER TABLE "programacao" ADD COLUMN "atualizacao_aberta_em" TIMESTAMP(3);
ALTER TABLE "programacao" ADD COLUMN "atualizacao_aberta_por" VARCHAR(200) NOT NULL DEFAULT '';

CREATE INDEX "programacao_atualizacao_aberta_em_idx" ON "programacao"("atualizacao_aberta_em");
