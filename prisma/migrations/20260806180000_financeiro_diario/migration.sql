CREATE TABLE "financeiro_diario_entry" (
    "id" TEXT NOT NULL,
    "escopo" VARCHAR(12) NOT NULL DEFAULT 'pdv',
    "portal_cliente_id" INTEGER,
    "portal_pdv_id" INTEGER,
    "cliente_nome" VARCHAR(200) NOT NULL DEFAULT '',
    "pdv_nome" VARCHAR(200) NOT NULL DEFAULT '',
    "codigo_display" VARCHAR(32) NOT NULL DEFAULT '',
    "texto" TEXT NOT NULL,
    "criado_por_email" VARCHAR(200) NOT NULL,
    "criado_por_nome" VARCHAR(120) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financeiro_diario_entry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "financeiro_diario_entry_created_at_idx" ON "financeiro_diario_entry"("created_at" DESC);
CREATE INDEX "financeiro_diario_entry_portal_cliente_id_idx" ON "financeiro_diario_entry"("portal_cliente_id");
CREATE INDEX "financeiro_diario_entry_portal_pdv_id_idx" ON "financeiro_diario_entry"("portal_pdv_id");
CREATE INDEX "financeiro_diario_entry_criado_por_email_idx" ON "financeiro_diario_entry"("criado_por_email");
