-- AlterTable
ALTER TABLE "programacao" ADD COLUMN "revision_atual" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "programacao" ADD COLUMN "cliente_gateway_id" INTEGER;
ALTER TABLE "programacao" ADD COLUMN "snapshot_atual" JSONB;

-- CreateTable
CREATE TABLE "programacao_atualizacao" (
    "id" TEXT NOT NULL,
    "programacao_id" TEXT NOT NULL,
    "codigo" VARCHAR(80) NOT NULL,
    "revision" INTEGER NOT NULL,
    "disparada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disparada_por" VARCHAR(200) NOT NULL DEFAULT '',
    "diff_json" JSONB NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "musicas_publicadas" INTEGER NOT NULL DEFAULT 0,
    "playlists_publicadas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "programacao_atualizacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "programacao_atualizacao_programacao_id_disparada_em_idx" ON "programacao_atualizacao"("programacao_id", "disparada_em");

ALTER TABLE "programacao_atualizacao" ADD CONSTRAINT "programacao_atualizacao_programacao_id_fkey" FOREIGN KEY ("programacao_id") REFERENCES "programacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
