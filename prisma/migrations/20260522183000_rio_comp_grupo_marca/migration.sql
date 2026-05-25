-- Planilha Rio: grupos "MARCA" (arrastar clientes no painel).

CREATE TABLE "rio_comp_grupo" (
    "id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rio_comp_grupo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rio_comp_grupo_month_id_sort_order_idx" ON "rio_comp_grupo"("month_id", "sort_order");

ALTER TABLE "rio_comp_grupo" ADD CONSTRAINT "rio_comp_grupo_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "rio_comp_month"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rio_comp_cliente_linha" ADD COLUMN "rio_grupo_id" TEXT;

CREATE INDEX "rio_comp_cliente_linha_rio_grupo_id_idx" ON "rio_comp_cliente_linha"("rio_grupo_id");

ALTER TABLE "rio_comp_cliente_linha" ADD CONSTRAINT "rio_comp_cliente_linha_rio_grupo_id_fkey" FOREIGN KEY ("rio_grupo_id") REFERENCES "rio_comp_grupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
