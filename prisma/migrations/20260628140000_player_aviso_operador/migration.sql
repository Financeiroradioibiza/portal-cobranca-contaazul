-- CreateTable
CREATE TABLE "player_aviso_operador" (
    "id" TEXT NOT NULL,
    "portal_cliente_id" INTEGER NOT NULL,
    "portal_pdv_id" INTEGER NOT NULL,
    "mensagem" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_aviso_operador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_aviso_operador_portal_cliente_id_portal_pdv_id_idx" ON "player_aviso_operador"("portal_cliente_id", "portal_pdv_id");
