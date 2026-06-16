-- CreateEnum
CREATE TYPE "ChamadoStatus" AS ENUM ('aberto', 'em_andamento', 'fechado');

-- CreateEnum
CREATE TYPE "ChamadoPrioridade" AS ENUM ('baixa', 'media', 'alta', 'urgente');

-- CreateTable
CREATE TABLE "chamado" (
    "id" TEXT NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "status" "ChamadoStatus" NOT NULL DEFAULT 'aberto',
    "prioridade" "ChamadoPrioridade" NOT NULL DEFAULT 'media',
    "setores_json" TEXT NOT NULL DEFAULT '[]',
    "responsaveis_json" TEXT NOT NULL DEFAULT '[]',
    "criado_por_email" VARCHAR(200) NOT NULL,
    "criado_por_nome" VARCHAR(120) NOT NULL,
    "fechado_por_email" VARCHAR(200),
    "fechado_por_nome" VARCHAR(120),
    "fechado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chamado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chamado_status_updated_at_idx" ON "chamado"("status", "updated_at");

-- CreateIndex
CREATE INDEX "chamado_criado_por_email_idx" ON "chamado"("criado_por_email");
