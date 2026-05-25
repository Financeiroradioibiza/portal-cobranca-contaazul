-- Planilha Rio v2 — snapshot mensal de clientes ativos Conta Azul + PDVs no portal

CREATE TYPE "RioClienteCompMovimento" AS ENUM ('estavel', 'entrada', 'saida');

CREATE TABLE "rio_comp_month" (
    "id" TEXT NOT NULL,
    "year_month" INTEGER NOT NULL,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rio_comp_month_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rio_comp_month_year_month_key" ON "rio_comp_month"("year_month");

CREATE TABLE "rio_comp_cliente_linha" (
    "id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "ca_person_id" TEXT NOT NULL,
    "grupo_site" TEXT NOT NULL DEFAULT '',
    "nome_fantasia" TEXT NOT NULL DEFAULT '',
    "razao_social" TEXT NOT NULL DEFAULT '',
    "documento" VARCHAR(64),
    "email_cobranca" TEXT,
    "valor_cliente_texto" VARCHAR(200) NOT NULL DEFAULT '',
    "numero_pdv_site" INTEGER NOT NULL DEFAULT 0,
    "categoria_site" VARCHAR(120) NOT NULL DEFAULT '',
    "contratos_ativos_texto" VARCHAR(400) NOT NULL DEFAULT '',
    "movimento" "RioClienteCompMovimento" NOT NULL DEFAULT 'estavel',
    "observacoes_linha" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "rio_comp_cliente_linha_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rio_comp_cliente_linha_month_id_ca_person_id_key" ON "rio_comp_cliente_linha"("month_id", "ca_person_id");
CREATE INDEX "rio_comp_cliente_linha_month_id_sort_order_idx" ON "rio_comp_cliente_linha"("month_id", "sort_order");

ALTER TABLE "rio_comp_cliente_linha" ADD CONSTRAINT "rio_comp_cliente_linha_month_id_fkey"
  FOREIGN KEY ("month_id") REFERENCES "rio_comp_month"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "rio_comp_pdv" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rio_comp_pdv_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rio_comp_pdv_cliente_id_sort_order_idx" ON "rio_comp_pdv"("cliente_id", "sort_order");

ALTER TABLE "rio_comp_pdv" ADD CONSTRAINT "rio_comp_pdv_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "rio_comp_cliente_linha"("id") ON DELETE CASCADE ON UPDATE CASCADE;
