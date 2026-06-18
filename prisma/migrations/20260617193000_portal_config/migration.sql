-- CreateTable
CREATE TABLE "portal_config" (
    "chave" VARCHAR(120) NOT NULL,
    "valor" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" VARCHAR(200) NOT NULL DEFAULT '',

    CONSTRAINT "portal_config_pkey" PRIMARY KEY ("chave")
);

-- Seed: ponto de mix padrão (segundos finais de fadeout para entrar a próxima faixa).
INSERT INTO "portal_config" ("chave", "valor", "updated_at", "updated_by")
VALUES ('criacao.ponto_mix_padrao_seg', '4', CURRENT_TIMESTAMP, 'sistema')
ON CONFLICT ("chave") DO NOTHING;
