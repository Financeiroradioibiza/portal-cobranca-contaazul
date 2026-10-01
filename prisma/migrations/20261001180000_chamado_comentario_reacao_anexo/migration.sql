-- Anexo por resposta + reações em comentários de chamado
ALTER TABLE "chamado_anexo" ADD COLUMN "comentario_id" VARCHAR(64);

CREATE INDEX "chamado_anexo_comentario_id_idx" ON "chamado_anexo"("comentario_id");

ALTER TABLE "chamado_anexo" ADD CONSTRAINT "chamado_anexo_comentario_id_fkey"
  FOREIGN KEY ("comentario_id") REFERENCES "chamado_comentario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "chamado_comentario_reacao" (
    "id" TEXT NOT NULL,
    "comentario_id" VARCHAR(64) NOT NULL,
    "user_email" VARCHAR(200) NOT NULL,
    "tipo" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_comentario_reacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chamado_comentario_reacao_comentario_id_user_email_tipo_key"
  ON "chamado_comentario_reacao"("comentario_id", "user_email", "tipo");

CREATE INDEX "chamado_comentario_reacao_comentario_id_idx" ON "chamado_comentario_reacao"("comentario_id");

ALTER TABLE "chamado_comentario_reacao" ADD CONSTRAINT "chamado_comentario_reacao_comentario_id_fkey"
  FOREIGN KEY ("comentario_id") REFERENCES "chamado_comentario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
