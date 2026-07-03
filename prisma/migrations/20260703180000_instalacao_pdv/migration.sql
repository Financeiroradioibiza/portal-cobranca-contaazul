-- Suporte → Instalação: senha temporária de uso único + log de envios de link

CREATE TABLE IF NOT EXISTS "pdv_instalacao_senha_temp" (
    "id" TEXT NOT NULL,
    "portal_cliente_id" INTEGER NOT NULL,
    "portal_pdv_id" INTEGER NOT NULL,
    "senha_hash" VARCHAR(128) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "usada_em" TIMESTAMP(3),
    "criada_por" VARCHAR(120) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdv_instalacao_senha_temp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pdv_instalacao_senha_temp_portal_cliente_id_portal_pdv_id_idx"
    ON "pdv_instalacao_senha_temp" ("portal_cliente_id", "portal_pdv_id");

CREATE TABLE IF NOT EXISTS "pdv_instalacao_envio" (
    "id" TEXT NOT NULL,
    "portal_cliente_id" INTEGER NOT NULL,
    "portal_pdv_id" INTEGER NOT NULL,
    "tipo" VARCHAR(24) NOT NULL,
    "plataforma" VARCHAR(16) NOT NULL,
    "canal" VARCHAR(16) NOT NULL,
    "destino_email" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "enviado_por" VARCHAR(120) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdv_instalacao_envio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pdv_instalacao_envio_portal_cliente_id_portal_pdv_id_idx"
    ON "pdv_instalacao_envio" ("portal_cliente_id", "portal_pdv_id");
