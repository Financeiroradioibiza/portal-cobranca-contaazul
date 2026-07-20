-- Arquivo de logs de atualização por cliente (sobrevive à exclusão da programação)

CREATE TABLE "cliente_programacao_atualizacao_arquivo" (
    "id" TEXT NOT NULL,
    "cliente_ref" VARCHAR(120) NOT NULL,
    "programacao_id" TEXT,
    "programacao_atualizacao_id" TEXT NOT NULL,
    "codigo" VARCHAR(80) NOT NULL,
    "tipo_subida" "TipoSubidaAtualizacao" NOT NULL DEFAULT 'atl',
    "especial_nome" VARCHAR(80) NOT NULL DEFAULT '',
    "competencia" VARCHAR(7) NOT NULL DEFAULT '',
    "rotulo_log" VARCHAR(120) NOT NULL DEFAULT '',
    "cliente_nome_log" VARCHAR(200) NOT NULL DEFAULT '',
    "programacao_nome_log" VARCHAR(120) NOT NULL DEFAULT '',
    "pdvs_log" VARCHAR(500) NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL,
    "disparada_em" TIMESTAMP(3) NOT NULL,
    "disparada_por" VARCHAR(200) NOT NULL DEFAULT '',
    "diff_json" JSONB NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "musicas_publicadas" INTEGER NOT NULL DEFAULT 0,
    "playlists_publicadas" INTEGER NOT NULL DEFAULT 0,
    "programacao_excluida_em" TIMESTAMP(3),

    CONSTRAINT "cliente_programacao_atualizacao_arquivo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cliente_programacao_atualizacao_arquivo_programacao_atualizacao_id_key"
    ON "cliente_programacao_atualizacao_arquivo"("programacao_atualizacao_id");

CREATE INDEX "cliente_programacao_atualizacao_arquivo_cliente_ref_disparada_em_idx"
    ON "cliente_programacao_atualizacao_arquivo"("cliente_ref", "disparada_em" DESC);

CREATE INDEX "cliente_programacao_atualizacao_arquivo_cliente_ref_tipo_subida_compet_idx"
    ON "cliente_programacao_atualizacao_arquivo"("cliente_ref", "tipo_subida", "competencia");

CREATE INDEX "cliente_programacao_atualizacao_arquivo_programacao_id_tipo_subida_idx"
    ON "cliente_programacao_atualizacao_arquivo"("programacao_id", "tipo_subida", "competencia");

-- Backfill: copiar logs existentes antes de apagar programações no futuro
INSERT INTO "cliente_programacao_atualizacao_arquivo" (
    "id",
    "cliente_ref",
    "programacao_id",
    "programacao_atualizacao_id",
    "codigo",
    "tipo_subida",
    "especial_nome",
    "competencia",
    "rotulo_log",
    "cliente_nome_log",
    "programacao_nome_log",
    "pdvs_log",
    "revision",
    "disparada_em",
    "disparada_por",
    "diff_json",
    "snapshot_json",
    "musicas_publicadas",
    "playlists_publicadas",
    "programacao_excluida_em"
)
SELECT
    pa."id" || '_arch',
    p."cliente_ref",
    pa."programacao_id",
    pa."id",
    pa."codigo",
    pa."tipo_subida",
    pa."especial_nome",
    pa."competencia",
    pa."rotulo_log",
    pa."cliente_nome_log",
    pa."programacao_nome_log",
    pa."pdvs_log",
    pa."revision",
    pa."disparada_em",
    pa."disparada_por",
    pa."diff_json",
    pa."snapshot_json",
    pa."musicas_publicadas",
    pa."playlists_publicadas",
    NULL
FROM "programacao_atualizacao" pa
INNER JOIN "programacao" p ON p."id" = pa."programacao_id"
ON CONFLICT ("programacao_atualizacao_id") DO NOTHING;
