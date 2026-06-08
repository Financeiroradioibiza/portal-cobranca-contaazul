-- CreateEnum
CREATE TYPE "PainelMatchMethod" AS ENUM ('cnpj', 'nome_pdv', 'nome_cliente', 'manual');

-- CreateTable
CREATE TABLE "painel_pdv_link" (
    "id" TEXT NOT NULL,
    "rio_comp_pdv_id" TEXT NOT NULL,
    "painel_pdv_id" INTEGER NOT NULL,
    "painel_cliente_id" INTEGER NOT NULL,
    "match_method" "PainelMatchMethod" NOT NULL,
    "painel_pdv_nome" TEXT,
    "painel_cliente_nome" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "painel_pdv_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "painel_pdv_link_rio_comp_pdv_id_key" ON "painel_pdv_link"("rio_comp_pdv_id");

-- CreateIndex
CREATE INDEX "painel_pdv_link_painel_pdv_id_idx" ON "painel_pdv_link"("painel_pdv_id");

-- AddForeignKey
ALTER TABLE "painel_pdv_link" ADD CONSTRAINT "painel_pdv_link_rio_comp_pdv_id_fkey" FOREIGN KEY ("rio_comp_pdv_id") REFERENCES "rio_comp_pdv"("id") ON DELETE CASCADE ON UPDATE CASCADE;
