-- CreateTable
CREATE TABLE "chamado_comentario" (
    "id" TEXT NOT NULL,
    "chamado_id" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "autor_email" VARCHAR(200) NOT NULL,
    "autor_nome" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_comentario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chamado_comentario_chamado_id_created_at_idx" ON "chamado_comentario"("chamado_id", "created_at");

-- AddForeignKey
ALTER TABLE "chamado_comentario" ADD CONSTRAINT "chamado_comentario_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
