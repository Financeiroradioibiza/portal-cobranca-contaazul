-- MusicBoard REWIND — configuração por cliente
CREATE TABLE "musicboard_cliente_config" (
    "portal_cliente_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "emails_json" JSONB NOT NULL DEFAULT '[]',
    "periodo" VARCHAR(8) NOT NULL DEFAULT '6m',
    "depoimento_texto" TEXT NOT NULL DEFAULT '',
    "depoimento_autor" VARCHAR(200) NOT NULL DEFAULT '',
    "narrativa_curador" TEXT NOT NULL DEFAULT '',
    "ultimo_envio_em" TIMESTAMP(3),
    "atualizado_por" VARCHAR(120) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "musicboard_cliente_config_pkey" PRIMARY KEY ("portal_cliente_id")
);
