-- CreateTable
CREATE TABLE "player_cliente_logotipo" (
    "portal_cliente_id" INTEGER NOT NULL,
    "jpeg_base64" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_cliente_logotipo_pkey" PRIMARY KEY ("portal_cliente_id")
);
