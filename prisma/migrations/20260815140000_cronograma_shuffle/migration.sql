-- Cronograma Shuffle: metadado portal-only; regras geradas são agendamentos normais.

CREATE TABLE "cronograma_shuffle" (
    "id" TEXT NOT NULL,
    "programacao_id" TEXT NOT NULL,
    "pasta_id" TEXT NOT NULL,
    "meses" VARCHAR(32) NOT NULL,
    "dias_semana" VARCHAR(32) NOT NULL DEFAULT '',
    "hora_inicio" VARCHAR(5) NOT NULL DEFAULT '00:00',
    "hora_fim" VARCHAR(5) NOT NULL DEFAULT '23:59',
    "frequencia_musicas" INTEGER,
    "expira_em" DATE NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agendamento_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "cronograma_shuffle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cronograma_shuffle_programacao_id_idx" ON "cronograma_shuffle"("programacao_id");
CREATE INDEX "cronograma_shuffle_pasta_id_idx" ON "cronograma_shuffle"("pasta_id");

ALTER TABLE "cronograma_shuffle" ADD CONSTRAINT "cronograma_shuffle_programacao_id_fkey" FOREIGN KEY ("programacao_id") REFERENCES "programacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cronograma_shuffle" ADD CONSTRAINT "cronograma_shuffle_pasta_id_fkey" FOREIGN KEY ("pasta_id") REFERENCES "pasta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
