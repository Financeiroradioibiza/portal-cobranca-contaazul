-- CreateTable
CREATE TABLE "chamado_inbox_usuario" (
    "user_email" VARCHAR(200) NOT NULL,
    "chamado_id" VARCHAR(64) NOT NULL,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chamado_inbox_usuario_pkey" PRIMARY KEY ("user_email","chamado_id")
);

-- CreateIndex
CREATE INDEX "chamado_inbox_usuario_user_email_idx" ON "chamado_inbox_usuario"("user_email");

-- AddForeignKey
ALTER TABLE "chamado_inbox_usuario" ADD CONSTRAINT "chamado_inbox_usuario_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
