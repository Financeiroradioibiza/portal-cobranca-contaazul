-- Comprovante de pagamento enviado pelo site cliente (cobrança) → chamado financeiro
CREATE TABLE "site_cliente_cobranca_comprovante" (
    "id" TEXT NOT NULL,
    "chamado_id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "parcela_id" TEXT NOT NULL,
    "ca_person_id" TEXT NOT NULL,
    "cliente_nome" TEXT NOT NULL DEFAULT '',
    "cnpj" TEXT NOT NULL DEFAULT '',
    "parcela_due" TEXT NOT NULL DEFAULT '',
    "parcela_summary" TEXT NOT NULL DEFAULT '',
    "parcela_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "file_name" TEXT NOT NULL DEFAULT '',
    "mime_type" TEXT NOT NULL DEFAULT '',
    "file_base64" TEXT NOT NULL DEFAULT '',
    "enviado_por_nome" TEXT NOT NULL DEFAULT '',
    "enviado_por_email" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_cliente_cobranca_comprovante_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_cliente_cobranca_comprovante_chamado_id_key" ON "site_cliente_cobranca_comprovante"("chamado_id");
CREATE INDEX "site_cliente_cobranca_comprovante_grupo_id_idx" ON "site_cliente_cobranca_comprovante"("grupo_id");
CREATE INDEX "site_cliente_cobranca_comprovante_ca_person_id_idx" ON "site_cliente_cobranca_comprovante"("ca_person_id");
