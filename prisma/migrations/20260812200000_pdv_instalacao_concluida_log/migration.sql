CREATE TABLE IF NOT EXISTS "pdv_instalacao_concluida_log" (
    "id" TEXT NOT NULL,
    "rio_pdv_key" VARCHAR(80) NOT NULL,
    "portal_cliente_id" INTEGER NOT NULL,
    "portal_pdv_id" INTEGER NOT NULL,
    "cliente_nome" TEXT NOT NULL DEFAULT '',
    "pdv_nome" TEXT NOT NULL DEFAULT '',
    "cnpj" VARCHAR(64) NOT NULL DEFAULT '',
    "contato_loja_nome" TEXT NOT NULL DEFAULT '',
    "contato_loja_telefone" VARCHAR(64) NOT NULL DEFAULT '',
    "contato_loja_email" TEXT NOT NULL DEFAULT '',
    "codigo_display" VARCHAR(24) NOT NULL DEFAULT '',
    "instalado_em" TIMESTAMP(3) NOT NULL,
    "primeiro_ping_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdv_instalacao_concluida_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pdv_instalacao_concluida_log_rio_instalado_key"
    ON "pdv_instalacao_concluida_log"("rio_pdv_key", "instalado_em");

CREATE INDEX IF NOT EXISTS "pdv_instalacao_concluida_log_instalado_em_idx"
    ON "pdv_instalacao_concluida_log"("instalado_em" DESC);
