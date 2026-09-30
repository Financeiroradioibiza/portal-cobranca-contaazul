-- CreateTable
CREATE TABLE "chamado_anexo" (
    "id" TEXT NOT NULL,
    "chamado_id" VARCHAR(64) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "file_base64" TEXT NOT NULL,
    "uploaded_by_email" VARCHAR(200) NOT NULL,
    "uploaded_by_nome" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamado_conversa_assunto" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "criado_por_email" VARCHAR(200) NOT NULL,
    "criado_por_nome" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chamado_conversa_assunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamado_conversa_mensagem" (
    "id" TEXT NOT NULL,
    "assunto_id" VARCHAR(64) NOT NULL,
    "corpo" TEXT NOT NULL,
    "mencoes_json" TEXT NOT NULL DEFAULT '[]',
    "autor_email" VARCHAR(200) NOT NULL,
    "autor_nome" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_conversa_mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamado_conversa_leitura" (
    "id" TEXT NOT NULL,
    "assunto_id" VARCHAR(64) NOT NULL,
    "user_email" VARCHAR(200) NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chamado_conversa_leitura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamado_conversa_anexo" (
    "id" TEXT NOT NULL,
    "mensagem_id" VARCHAR(64) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "file_base64" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_conversa_anexo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chamado_anexo_chamado_id_idx" ON "chamado_anexo"("chamado_id");

-- CreateIndex
CREATE UNIQUE INDEX "chamado_conversa_assunto_slug_key" ON "chamado_conversa_assunto"("slug");

-- CreateIndex
CREATE INDEX "chamado_conversa_mensagem_assunto_id_created_at_idx" ON "chamado_conversa_mensagem"("assunto_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chamado_conversa_leitura_assunto_id_user_email_key" ON "chamado_conversa_leitura"("assunto_id", "user_email");

-- CreateIndex
CREATE INDEX "chamado_conversa_anexo_mensagem_id_idx" ON "chamado_conversa_anexo"("mensagem_id");

-- AddForeignKey
ALTER TABLE "chamado_conversa_mensagem" ADD CONSTRAINT "chamado_conversa_mensagem_assunto_id_fkey" FOREIGN KEY ("assunto_id") REFERENCES "chamado_conversa_assunto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_conversa_leitura" ADD CONSTRAINT "chamado_conversa_leitura_assunto_id_fkey" FOREIGN KEY ("assunto_id") REFERENCES "chamado_conversa_assunto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_conversa_anexo" ADD CONSTRAINT "chamado_conversa_anexo_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "chamado_conversa_mensagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
