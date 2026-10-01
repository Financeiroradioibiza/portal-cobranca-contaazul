-- CreateEnum
CREATE TYPE "ChamadoConversaAssuntoTipo" AS ENUM ('canal', 'cliente');

-- AlterTable
ALTER TABLE "chamado_conversa_assunto" ADD COLUMN "tipo" "ChamadoConversaAssuntoTipo" NOT NULL DEFAULT 'canal';
ALTER TABLE "chamado_conversa_assunto" ADD COLUMN "cliente_key" VARCHAR(120);
ALTER TABLE "chamado_conversa_assunto" ADD COLUMN "rio_linha_id" VARCHAR(64);

-- AlterTable
ALTER TABLE "chamado_conversa_mensagem" ADD COLUMN "reply_to_mensagem_id" VARCHAR(64);

-- CreateIndex
CREATE INDEX "chamado_conversa_assunto_cliente_key_idx" ON "chamado_conversa_assunto"("cliente_key");

-- CreateTable
CREATE TABLE "chamado_conversa_reacao" (
    "id" TEXT NOT NULL,
    "mensagem_id" VARCHAR(64) NOT NULL,
    "user_email" VARCHAR(200) NOT NULL,
    "tipo" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_conversa_reacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamado_conversa_msg_estado" (
    "mensagem_id" VARCHAR(64) NOT NULL,
    "user_email" VARCHAR(200) NOT NULL,
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    "forcar_nao_lida" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "chamado_conversa_msg_estado_pkey" PRIMARY KEY ("mensagem_id","user_email")
);

-- CreateIndex
CREATE UNIQUE INDEX "chamado_conversa_reacao_mensagem_id_user_email_tipo_key" ON "chamado_conversa_reacao"("mensagem_id", "user_email", "tipo");

-- CreateIndex
CREATE INDEX "chamado_conversa_reacao_mensagem_id_idx" ON "chamado_conversa_reacao"("mensagem_id");

-- AddForeignKey
ALTER TABLE "chamado_conversa_mensagem" ADD CONSTRAINT "chamado_conversa_mensagem_reply_to_mensagem_id_fkey" FOREIGN KEY ("reply_to_mensagem_id") REFERENCES "chamado_conversa_mensagem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_conversa_reacao" ADD CONSTRAINT "chamado_conversa_reacao_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "chamado_conversa_mensagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_conversa_msg_estado" ADD CONSTRAINT "chamado_conversa_msg_estado_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "chamado_conversa_mensagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
