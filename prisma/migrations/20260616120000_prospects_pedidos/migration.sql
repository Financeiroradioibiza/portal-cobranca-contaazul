-- CreateEnum
CREATE TYPE "ProspectEstagio" AS ENUM ('lead', 'em_contato', 'demo_enviada', 'fechado');

-- CreateEnum
CREATE TYPE "PedidoClienteStatus" AS ENUM ('rascunho', 'enviado', 'em_analise', 'importado', 'cancelado');

-- CreateTable
CREATE TABLE "prospect" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(200) NOT NULL,
    "cidade" VARCHAR(120) NOT NULL DEFAULT '',
    "estado" VARCHAR(2) NOT NULL DEFAULT '',
    "unidades" INTEGER NOT NULL DEFAULT 1,
    "origem" VARCHAR(200) NOT NULL DEFAULT '',
    "status_nota" VARCHAR(200) NOT NULL DEFAULT '',
    "valor_centavos" INTEGER NOT NULL DEFAULT 0,
    "estagio" "ProspectEstagio" NOT NULL DEFAULT 'lead',
    "contato_nome" VARCHAR(120) NOT NULL DEFAULT '',
    "contato_email" VARCHAR(200) NOT NULL DEFAULT '',
    "contato_telefone" VARCHAR(40) NOT NULL DEFAULT '',
    "observacoes" TEXT NOT NULL DEFAULT '',
    "preview_musical_url" TEXT NOT NULL DEFAULT '',
    "preview_musical_nota" VARCHAR(400) NOT NULL DEFAULT '',
    "proposta_enviada_em" TIMESTAMP(3),
    "demo_enviada_em" TIMESTAMP(3),
    "fechado_em" TIMESTAMP(3),
    "rio_grupo_nome" VARCHAR(200) NOT NULL DEFAULT '',
    "template_programacao" VARCHAR(200) NOT NULL DEFAULT '',
    "pedido_cliente_id" VARCHAR(64),
    "criado_por_email" VARCHAR(200) NOT NULL,
    "criado_por_nome" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_cliente_pdv" (
    "id" TEXT NOT NULL,
    "status" "PedidoClienteStatus" NOT NULL DEFAULT 'rascunho',
    "chamado_id" VARCHAR(64),
    "rio_linha_id" VARCHAR(64),
    "importado_em" TIMESTAMP(3),
    "importado_por_email" VARCHAR(200),
    "prospect_id" VARCHAR(64),
    "nome_fantasia" VARCHAR(200) NOT NULL,
    "razao_social" TEXT NOT NULL DEFAULT '',
    "documento" VARCHAR(64),
    "email_cobranca" VARCHAR(200) NOT NULL DEFAULT '',
    "origem_cliente" VARCHAR(10) NOT NULL DEFAULT '',
    "valor_pdv_unitario_texto" VARCHAR(200) NOT NULL DEFAULT '',
    "numero_pdv_site" INTEGER NOT NULL DEFAULT 1,
    "categoria_site" VARCHAR(120) NOT NULL DEFAULT '',
    "observacoes_cliente" TEXT NOT NULL DEFAULT '',
    "rio_grupo_id" VARCHAR(64),
    "grupo_site" VARCHAR(200) NOT NULL DEFAULT '',
    "pdvs_json" TEXT NOT NULL DEFAULT '[]',
    "criado_por_email" VARCHAR(200) NOT NULL,
    "criado_por_nome" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedido_cliente_pdv_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prospect_estagio_updated_at_idx" ON "prospect"("estagio", "updated_at");

-- CreateIndex
CREATE INDEX "pedido_cliente_pdv_status_updated_at_idx" ON "pedido_cliente_pdv"("status", "updated_at");

-- CreateIndex
CREATE INDEX "pedido_cliente_pdv_chamado_id_idx" ON "pedido_cliente_pdv"("chamado_id");
