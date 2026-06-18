-- CreateEnum
CREATE TYPE "MusicaProcessStatus" AS ENUM ('pendente', 'processando', 'revisao_duplicata', 'pronta', 'erro');

-- CreateEnum
CREATE TYPE "FormatoEntrega" AS ENUM ('mp3_128_mono', 'mp3_128_stereo', 'mp3_192_mono', 'mp3_192_stereo');

-- CreateEnum
CREATE TYPE "VinhetaTipo" AS ENUM ('tts', 'audio');

-- CreateEnum
CREATE TYPE "JobTipo" AS ENUM ('upload_pasta', 'enriquecer_tags', 'transcode_cliente');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('aguardando', 'processando', 'revisao', 'concluido', 'erro', 'cancelado');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('aguardando', 'processando', 'duplicata', 'concluido', 'erro');

-- CreateTable
CREATE TABLE "musica_biblioteca" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT '',
    "artista" TEXT NOT NULL DEFAULT '',
    "ano" INTEGER,
    "duration_ms" INTEGER,
    "isrc" VARCHAR(32),
    "acoust_id" VARCHAR(64),
    "chromaprint" TEXT,
    "content_hash" VARCHAR(80),
    "master_storage_key" VARCHAR(300),
    "master_bitrate" INTEGER,
    "loudness_lufs" DOUBLE PRECISION,
    "true_peak_db" DOUBLE PRECISION,
    "bpm" INTEGER,
    "tom" VARCHAR(16),
    "energia" DOUBLE PRECISION,
    "valencia" DOUBLE PRECISION,
    "danceabilidade" DOUBLE PRECISION,
    "acustico" DOUBLE PRECISION,
    "instrumental" DOUBLE PRECISION,
    "tags_auto" JSONB NOT NULL DEFAULT '[]',
    "mix_segundos_finais" INTEGER,
    "mix_auto" BOOLEAN NOT NULL DEFAULT true,
    "trim_inicio_ms" INTEGER,
    "trim_fim_ms" INTEGER,
    "status" "MusicaProcessStatus" NOT NULL DEFAULT 'pendente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "musica_biblioteca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_criativo" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "cor" VARCHAR(9) NOT NULL DEFAULT '#888888',
    "criativo_user_id" TEXT,
    "criativo_nome" VARCHAR(120) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_criativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "musica_tag_manual" (
    "musica_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "musica_tag_manual_pkey" PRIMARY KEY ("musica_id","tag_id")
);

-- CreateTable
CREATE TABLE "musica_versao" (
    "id" TEXT NOT NULL,
    "musica_id" TEXT NOT NULL,
    "formato" "FormatoEntrega" NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "musica_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programacao" (
    "id" TEXT NOT NULL,
    "cliente_ref" VARCHAR(120) NOT NULL,
    "cliente_nome" VARCHAR(200) NOT NULL DEFAULT '',
    "nome" VARCHAR(120) NOT NULL,
    "formato_padrao" "FormatoEntrega" NOT NULL DEFAULT 'mp3_128_mono',
    "publicada" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "criativo_user_id" TEXT,
    "criativo_nome" VARCHAR(120) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pasta" (
    "id" TEXT NOT NULL,
    "programacao_id" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "velocidade" VARCHAR(16) NOT NULL DEFAULT 'media',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pasta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pasta_musica" (
    "pasta_id" TEXT NOT NULL,
    "musica_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pasta_musica_pkey" PRIMARY KEY ("pasta_id","musica_id")
);

-- CreateTable
CREATE TABLE "vinheta" (
    "id" TEXT NOT NULL,
    "programacao_id" TEXT,
    "nome" VARCHAR(160) NOT NULL,
    "tipo" "VinhetaTipo" NOT NULL DEFAULT 'tts',
    "texto" TEXT NOT NULL DEFAULT '',
    "voz" VARCHAR(80) NOT NULL DEFAULT '',
    "trilha_storage_key" VARCHAR(300),
    "storage_key" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vinheta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processamento_job" (
    "id" TEXT NOT NULL,
    "tipo" "JobTipo" NOT NULL DEFAULT 'upload_pasta',
    "status" "JobStatus" NOT NULL DEFAULT 'aguardando',
    "etapa_atual" VARCHAR(24) NOT NULL DEFAULT 'upload',
    "titulo" VARCHAR(200) NOT NULL DEFAULT '',
    "cliente_ref" VARCHAR(120),
    "cliente_nome" VARCHAR(200) NOT NULL DEFAULT '',
    "criativo_nome" VARCHAR(120) NOT NULL DEFAULT '',
    "total_itens" INTEGER NOT NULL DEFAULT 0,
    "itens_feitos" INTEGER NOT NULL DEFAULT 0,
    "erro_msg" TEXT NOT NULL DEFAULT '',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processamento_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processamento_item" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "arquivo_nome" TEXT NOT NULL DEFAULT '',
    "raw_storage_key" VARCHAR(300),
    "status" "ItemStatus" NOT NULL DEFAULT 'aguardando',
    "musica_id" TEXT,
    "duplicata_de_id" TEXT,
    "erro_msg" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processamento_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "musica_rejeicao" (
    "id" TEXT NOT NULL,
    "musica_id" TEXT NOT NULL,
    "cliente_ref" VARCHAR(120) NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "musica_rejeicao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "musica_biblioteca_artista_idx" ON "musica_biblioteca"("artista");

-- CreateIndex
CREATE INDEX "musica_biblioteca_titulo_idx" ON "musica_biblioteca"("titulo");

-- CreateIndex
CREATE INDEX "musica_biblioteca_isrc_idx" ON "musica_biblioteca"("isrc");

-- CreateIndex
CREATE INDEX "musica_biblioteca_acoust_id_idx" ON "musica_biblioteca"("acoust_id");

-- CreateIndex
CREATE INDEX "musica_biblioteca_status_idx" ON "musica_biblioteca"("status");

-- CreateIndex
CREATE INDEX "tag_criativo_criativo_user_id_idx" ON "tag_criativo"("criativo_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_criativo_nome_criativo_user_id_key" ON "tag_criativo"("nome", "criativo_user_id");

-- CreateIndex
CREATE INDEX "musica_tag_manual_tag_id_idx" ON "musica_tag_manual"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "musica_versao_musica_id_formato_key" ON "musica_versao"("musica_id", "formato");

-- CreateIndex
CREATE INDEX "programacao_cliente_ref_idx" ON "programacao"("cliente_ref");

-- CreateIndex
CREATE INDEX "pasta_programacao_id_sort_order_idx" ON "pasta"("programacao_id", "sort_order");

-- CreateIndex
CREATE INDEX "pasta_musica_musica_id_idx" ON "pasta_musica"("musica_id");

-- CreateIndex
CREATE INDEX "vinheta_programacao_id_idx" ON "vinheta"("programacao_id");

-- CreateIndex
CREATE INDEX "processamento_job_status_created_at_idx" ON "processamento_job"("status", "created_at");

-- CreateIndex
CREATE INDEX "processamento_item_job_id_status_idx" ON "processamento_item"("job_id", "status");

-- CreateIndex
CREATE INDEX "musica_rejeicao_cliente_ref_idx" ON "musica_rejeicao"("cliente_ref");

-- CreateIndex
CREATE UNIQUE INDEX "musica_rejeicao_musica_id_cliente_ref_key" ON "musica_rejeicao"("musica_id", "cliente_ref");

-- AddForeignKey
ALTER TABLE "musica_tag_manual" ADD CONSTRAINT "musica_tag_manual_musica_id_fkey" FOREIGN KEY ("musica_id") REFERENCES "musica_biblioteca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "musica_tag_manual" ADD CONSTRAINT "musica_tag_manual_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag_criativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "musica_versao" ADD CONSTRAINT "musica_versao_musica_id_fkey" FOREIGN KEY ("musica_id") REFERENCES "musica_biblioteca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasta" ADD CONSTRAINT "pasta_programacao_id_fkey" FOREIGN KEY ("programacao_id") REFERENCES "programacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasta_musica" ADD CONSTRAINT "pasta_musica_pasta_id_fkey" FOREIGN KEY ("pasta_id") REFERENCES "pasta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasta_musica" ADD CONSTRAINT "pasta_musica_musica_id_fkey" FOREIGN KEY ("musica_id") REFERENCES "musica_biblioteca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinheta" ADD CONSTRAINT "vinheta_programacao_id_fkey" FOREIGN KEY ("programacao_id") REFERENCES "programacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processamento_item" ADD CONSTRAINT "processamento_item_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "processamento_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "musica_rejeicao" ADD CONSTRAINT "musica_rejeicao_musica_id_fkey" FOREIGN KEY ("musica_id") REFERENCES "musica_biblioteca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

