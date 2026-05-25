-- Rio Planilha — competência mensal (substitui cópia manual do Excel)

CREATE TYPE "RioPlanilhaBand" AS ENUM ('canceladas', 'novos', 'ativos');
CREATE TYPE "RioPlanilhaRowKind" AS ENUM ('secao', 'grupo', 'pdv');
CREATE TYPE "RioChargeMode" AS ENUM ('herda_grupo', 'cliente_ca_proprio');

CREATE TABLE "rio_planilha_month" (
    "id" TEXT NOT NULL,
    "year_month" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rio_planilha_month_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rio_planilha_month_year_month_key" ON "rio_planilha_month"("year_month");

CREATE TABLE "rio_planilha_row" (
    "id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "band" "RioPlanilhaBand" NOT NULL,
    "kind" "RioPlanilhaRowKind" NOT NULL,
    "parent_id" TEXT,
    "titulo_secao" TEXT,
    "marca" TEXT NOT NULL DEFAULT '',
    "num_ordem" INTEGER,
    "pdv_nome" TEXT NOT NULL DEFAULT '',
    "cnpj_documento" TEXT,
    "status" TEXT NOT NULL DEFAULT '',
    "valor_texto" TEXT,
    "qtde_texto" TEXT,
    "categoria" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "data_install" TEXT,
    "grupo_cobranca" TEXT NOT NULL DEFAULT '',
    "razao" TEXT NOT NULL DEFAULT '',
    "data_cancel" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "conta_azul_person_id" TEXT,
    "charge_mode" "RioChargeMode" NOT NULL DEFAULT 'herda_grupo',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rio_planilha_row_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rio_planilha_row_month_id_sort_order_idx" ON "rio_planilha_row"("month_id", "sort_order");
CREATE INDEX "rio_planilha_row_month_id_band_sort_order_idx" ON "rio_planilha_row"("month_id", "band", "sort_order");

ALTER TABLE "rio_planilha_row" ADD CONSTRAINT "rio_planilha_row_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "rio_planilha_month" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rio_planilha_row" ADD CONSTRAINT "rio_planilha_row_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "rio_planilha_row" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
