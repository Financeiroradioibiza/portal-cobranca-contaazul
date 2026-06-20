-- CreateEnum
CREATE TYPE "PlayerIngestTipo" AS ENUM ('feedback', 'cadastro');

-- CreateEnum
CREATE TYPE "PlayerIngestStatus" AS ENUM ('pendente', 'conciliado', 'arquivado');

-- CreateTable
CREATE TABLE "player_ingest" (
    "id" TEXT NOT NULL,
    "tipo" "PlayerIngestTipo" NOT NULL,
    "status" "PlayerIngestStatus" NOT NULL DEFAULT 'pendente',
    "cliente_gateway_id" INTEGER,
    "cliente_nome" VARCHAR(200) NOT NULL DEFAULT '',
    "pdv_gateway_id" INTEGER,
    "pdv_nome" VARCHAR(200) NOT NULL DEFAULT '',
    "portal_pdv_id" INTEGER,
    "rio_pdv_key" VARCHAR(120),
    "mensagem" TEXT NOT NULL DEFAULT '',
    "payload_json" TEXT NOT NULL DEFAULT '{}',
    "chamado_id" VARCHAR(64),
    "conciliado_por_email" VARCHAR(200),
    "conciliado_por_nome" VARCHAR(120),
    "conciliado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_ingest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_ingest_tipo_status_updated_at_idx" ON "player_ingest"("tipo", "status", "updated_at");

-- CreateIndex
CREATE INDEX "player_ingest_rio_pdv_key_idx" ON "player_ingest"("rio_pdv_key");

-- CreateIndex
CREATE INDEX "player_ingest_chamado_id_idx" ON "player_ingest"("chamado_id");
