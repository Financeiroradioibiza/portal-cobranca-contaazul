-- CreateEnum
CREATE TYPE "PlanilhaProdSistema" AS ENUM ('painel', 'dois_sistemas', 'player5', 'cancelado');

-- CreateTable
CREATE TABLE "planilha_prod_month" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(16) NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "sort_key" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planilha_prod_month_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planilha_prod_row" (
    "id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "sistema" "PlanilhaProdSistema" NOT NULL DEFAULT 'painel',
    "cliente_label" TEXT NOT NULL DEFAULT '',
    "criativo" VARCHAR(80) NOT NULL DEFAULT '',
    "entrega_atl" TEXT NOT NULL DEFAULT '',
    "convertido_gain" TEXT NOT NULL DEFAULT '',
    "arrastado" TEXT NOT NULL DEFAULT '',
    "sincronizado" TEXT NOT NULL DEFAULT '',
    "status_player_novo" TEXT NOT NULL DEFAULT '',
    "obs_criacao" TEXT NOT NULL DEFAULT '',
    "obs_producao" TEXT NOT NULL DEFAULT '',
    "linked_cliente_ref" VARCHAR(120) NOT NULL DEFAULT '',
    "linked_programacao_id" VARCHAR(80) NOT NULL DEFAULT '',
    "linked_cliente_nome" TEXT NOT NULL DEFAULT '',
    "linked_programacao_nome" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planilha_prod_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planilha_prod_month_slug_key" ON "planilha_prod_month"("slug");

-- CreateIndex
CREATE INDEX "planilha_prod_month_sort_key_idx" ON "planilha_prod_month"("sort_key");

-- CreateIndex
CREATE INDEX "planilha_prod_row_month_id_sort_order_idx" ON "planilha_prod_row"("month_id", "sort_order");

-- CreateIndex
CREATE INDEX "planilha_prod_row_month_id_criativo_idx" ON "planilha_prod_row"("month_id", "criativo");

-- AddForeignKey
ALTER TABLE "planilha_prod_row" ADD CONSTRAINT "planilha_prod_row_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "planilha_prod_month"("id") ON DELETE CASCADE ON UPDATE CASCADE;
