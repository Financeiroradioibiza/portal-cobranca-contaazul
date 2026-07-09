-- CreateTable
CREATE TABLE "musica_biblioteca_voto" (
    "id" TEXT NOT NULL,
    "musica_id" TEXT NOT NULL,
    "portal_cliente_id" INTEGER NOT NULL,
    "portal_pdv_id" INTEGER NOT NULL,
    "pdv_nome" VARCHAR(200) NOT NULL DEFAULT '',
    "cliente_nome" VARCHAR(200) NOT NULL DEFAULT '',
    "voto" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "musica_biblioteca_voto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "musica_biblioteca_voto_musica_id_portal_pdv_id_key" ON "musica_biblioteca_voto"("musica_id", "portal_pdv_id");

-- CreateIndex
CREATE INDEX "musica_biblioteca_voto_musica_id_idx" ON "musica_biblioteca_voto"("musica_id");

-- CreateIndex
CREATE INDEX "musica_biblioteca_voto_portal_pdv_id_idx" ON "musica_biblioteca_voto"("portal_pdv_id");

-- AddForeignKey
ALTER TABLE "musica_biblioteca_voto" ADD CONSTRAINT "musica_biblioteca_voto_musica_id_fkey" FOREIGN KEY ("musica_id") REFERENCES "musica_biblioteca"("id") ON DELETE CASCADE ON UPDATE CASCADE;
