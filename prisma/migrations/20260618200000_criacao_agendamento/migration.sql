-- CreateEnum
CREATE TYPE "AgendamentoAlvo" AS ENUM ('pasta', 'vinheta');

-- CreateTable
CREATE TABLE "agendamento" (
    "id" TEXT NOT NULL,
    "programacao_id" TEXT NOT NULL,
    "alvo_tipo" "AgendamentoAlvo" NOT NULL,
    "alvo_id" TEXT NOT NULL,
    "dias_semana" VARCHAR(32) NOT NULL DEFAULT '',
    "hora_inicio" VARCHAR(5) NOT NULL DEFAULT '00:00',
    "hora_fim" VARCHAR(5) NOT NULL DEFAULT '23:59',
    "data_inicio" DATE,
    "data_fim" DATE,
    "frequencia_min" INTEGER,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agendamento_programacao_id_idx" ON "agendamento"("programacao_id");

-- CreateIndex
CREATE INDEX "agendamento_alvo_tipo_alvo_id_idx" ON "agendamento"("alvo_tipo", "alvo_id");

-- AddForeignKey
ALTER TABLE "agendamento" ADD CONSTRAINT "agendamento_programacao_id_fkey" FOREIGN KEY ("programacao_id") REFERENCES "programacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
