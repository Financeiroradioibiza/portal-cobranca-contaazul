-- Instalação 5 — código de uso único para Google Play (TWA)

CREATE TABLE IF NOT EXISTS "pdv_instalacao_play_codigo" (
    "id" TEXT NOT NULL,
    "portal_cliente_id" INTEGER NOT NULL,
    "portal_pdv_id" INTEGER NOT NULL,
    "rio_pdv_key" VARCHAR(80) NOT NULL DEFAULT '',
    "codigo_hash" VARCHAR(128) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "usada_em" TIMESTAMP(3),
    "criada_por" VARCHAR(120) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdv_instalacao_play_codigo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pdv_instalacao_play_codigo_portal_cliente_id_portal_pdv_id_idx"
    ON "pdv_instalacao_play_codigo" ("portal_cliente_id", "portal_pdv_id");

CREATE INDEX IF NOT EXISTS "pdv_instalacao_play_codigo_codigo_hash_idx"
    ON "pdv_instalacao_play_codigo" ("codigo_hash");
